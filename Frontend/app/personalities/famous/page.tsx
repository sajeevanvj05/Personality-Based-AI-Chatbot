"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { storage } from "@/lib/storage"
import { chatFamousPersonality, generateFamousPersonalitySystemPrompt, identifyFamousPerson, startFamousPersonality } from "@/lib/api"

type Msg = { id: string; role: "user" | "assistant"; content: string }

export default function FamousPersonalityPage() {
  const router = useRouter()
  const [knowsName, setKnowsName] = useState<"yes" | "no">("yes")
  const [quoteText, setQuoteText] = useState("")
  const [suggestions, setSuggestions] = useState<{ name: string; confidence: number; reason: string; notes?: string | null }[]>([])
  const [followup, setFollowup] = useState<string>("")
  const [identifyLoading, setIdentifyLoading] = useState(false)
  const [famousName, setFamousName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [personalityId, setPersonalityId] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [generated, setGenerated] = useState(false)
  const [voicePromptOpen, setVoicePromptOpen] = useState(false)

  const canStart = useMemo(() => famousName.trim().length >= 2 && !busy, [famousName, busy])
  const canSend = useMemo(() => !!personalityId && input.trim().length > 0 && !busy, [personalityId, input, busy])
  const canGenerate = useMemo(
    () => !!personalityId && messages.length >= 3 && !busy && !generated,
    [personalityId, messages.length, busy, generated]
  )

  const requireToken = () => {
    const session = storage.getSession()
    const token = session?.accessToken
    if (!token) throw new Error("You are not logged in. Please sign in again.")
    return token
  }

  const handleIdentify = async () => {
    setError("")
    setFollowup("")
    setSuggestions([])
    const text = quoteText.trim()
    if (text.length < 3) {
      setError("Please paste a quote or description first.")
      return
    }
    setIdentifyLoading(true)
    try {
      const token = requireToken()
      const resp = await identifyFamousPerson({ token, req: { text } })
      setSuggestions(resp.candidates || [])
      setFollowup(resp.followup_question || "")
      if (resp.best_guess_name && !resp.needs_more_info) {
        setFamousName(resp.best_guess_name)
      }
    } catch (e) {
      console.error("[famous] identify failed:", e)
      setError("Could not identify the person. Try adding more text or context.")
    } finally {
      setIdentifyLoading(false)
    }
  }

  const handleStart = async () => {
    setError("")
    setBusy(true)
    try {
      const token = requireToken()
      const resp = await startFamousPersonality({
        token,
        req: { famous_name: famousName.trim(), display_name: displayName.trim() || undefined },
      })
      setPersonalityId(resp.personality_id)
      setSessionId(resp.session_id)
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content: resp.reply || "" }])
    } catch (e) {
      console.error("[famous] start failed:", e)
      setError("Could not start builder. Make sure backend is running and OPENAI_API_KEY is set.")
    } finally {
      setBusy(false)
    }
  }

  const handleSend = async () => {
    if (!canSend) return
    setError("")
    const text = input.trim()
    setInput("")
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }])
    setBusy(true)
    try {
      const token = requireToken()
      const resp = await chatFamousPersonality({ token, req: { personality_id: personalityId, message: text } })
      setSessionId(resp.session_id)
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: resp.reply || "" }])
    } catch (e) {
      console.error("[famous] chat failed:", e)
      setError("Chat failed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const handleGenerate = async () => {
    if (!canGenerate) return
    setError("")
    setBusy(true)
    try {
      const token = requireToken()
      await generateFamousPersonalitySystemPrompt({ token, req: { personality_id: personalityId } })
      setGenerated(true)
      setVoicePromptOpen(true)
    } catch (e) {
      console.error("[famous] generate prompt failed:", e)
      setError("Could not generate the system prompt. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const goToVoiceSetup = () => {
    if (!personalityId) return
    router.push(`/personalities/famous/voice?personality_id=${encodeURIComponent(personalityId)}`)
  }

  const goToChat = () => {
    if (!personalityId) return
    router.push(`/chat?personality_id=${encodeURIComponent(personalityId)}`)
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create a Famous Personality</h1>
              <p className="text-sm text-muted-foreground">
                Build a chatbot persona inspired by a famous person’s public style, then generate a system prompt.
              </p>
            </div>
            <Button asChild variant="outline" className="bg-transparent">
              <Link href="/chat">Back to Chat</Link>
            </Button>
          </div>

          {!personalityId ? (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Start</CardTitle>
                <CardDescription>Do you know the person’s name? If not, paste a quote and we’ll try to identify them.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={knowsName === "yes" ? "default" : "outline"}
                    className={knowsName === "yes" ? "" : "bg-transparent"}
                    onClick={() => setKnowsName("yes")}
                    disabled={busy}
                  >
                    I know the name
                  </Button>
                  <Button
                    type="button"
                    variant={knowsName === "no" ? "default" : "outline"}
                    className={knowsName === "no" ? "" : "bg-transparent"}
                    onClick={() => setKnowsName("no")}
                    disabled={busy}
                  >
                    I only have a quote
                  </Button>
                </div>

                {knowsName === "no" ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Quote / description</div>
                      <Textarea
                        value={quoteText}
                        onChange={(e) => setQuoteText(e.target.value)}
                        placeholder='Paste a quote (or describe the person). Example: "Stay hungry, stay foolish."'
                        className="min-h-[120px]"
                        disabled={busy || identifyLoading}
                      />
                    </div>
                    <Button onClick={handleIdentify} disabled={identifyLoading || busy || quoteText.trim().length < 3}>
                      {identifyLoading ? "Finding..." : "Find Person"}
                    </Button>

                    {followup ? (
                      <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-900">
                        <span className="font-medium">Need more info:</span> {followup}
                      </div>
                    ) : null}

                    {suggestions.length ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Suggestions</div>
                        <div className="space-y-2">
                          {suggestions.map((s) => (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => {
                                setFamousName(s.name)
                                if (!displayName.trim()) setDisplayName(`${s.name} (inspired)`)
                                setKnowsName("yes")
                              }}
                              className="w-full rounded-lg border bg-white p-3 text-left hover:bg-indigo-50 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium text-gray-900">{s.name}</div>
                                <div className="text-xs text-muted-foreground">{Math.round((s.confidence || 0) * 100)}%</div>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">{s.reason}</div>
                              {s.notes ? <div className="mt-1 text-xs text-muted-foreground">{s.notes}</div> : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1">
                  <div className="text-sm font-medium">Famous person</div>
                  <Input
                    value={famousName}
                    onChange={(e) => setFamousName(e.target.value)}
                    placeholder="e.g., Steve Jobs"
                    disabled={knowsName !== "yes" || busy}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">Personality name (optional)</div>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Jobs (Keynote era)"
                    disabled={knowsName !== "yes" || busy}
                  />
                </div>
                {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
                <Button onClick={handleStart} disabled={!canStart} className="w-full">
                  {busy ? "Starting..." : "Start Builder Chat"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Builder Chat</CardTitle>
                <CardDescription>
                  Personality: <span className="font-medium">{displayName.trim() || famousName.trim() || "—"}</span>
                  {" · "}
                  <span className="text-xs text-muted-foreground">ID: {personalityId}</span>
                  {" · "}
                  <span className="text-xs text-muted-foreground">Session: {sessionId}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

                <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border bg-white p-3">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                            : "bg-gray-50 text-gray-900"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Reply to the assistant’s questions (tone, humor, boundaries, topics, era)..."
                    className="min-h-[70px] resize-none"
                    disabled={busy}
                  />
                  <Button onClick={handleSend} disabled={!canSend} className="h-[50px] px-6">
                    {busy ? "Processing..." : "Send"}
                  </Button>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={handleGenerate} disabled={!canGenerate} className="flex-1">
                    {busy ? "Generating..." : generated ? "Prompt Generated" : "Save Personality"}
                  </Button>
                  <Button onClick={goToChat} disabled={!generated} variant="outline" className="flex-1 bg-transparent">
                    Chat with this Personality
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Tip: chat 3–6 messages first. When it looks right, click “Generate & Save System Prompt”.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={voicePromptOpen} onOpenChange={setVoicePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Do you want a specific voice for this personality?</AlertDialogTitle>
            <AlertDialogDescription>
              If you select <span className="font-medium">Yes</span>, you’ll upload 2 voice clips (about 10 seconds each) for this
              famous personality. If you select <span className="font-medium">No</span>, we’ll use your default voice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setVoicePromptOpen(false)
                goToChat()
              }}
            >
              No (use default voice)
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setVoicePromptOpen(false)
                goToVoiceSetup()
              }}
            >
              Yes (upload voice)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthGuard>
  )
}


