"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { storage } from "@/lib/storage"
import { chatWithAssistant, speakVoice, transcribeVoice } from "@/lib/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export default function ChatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activePersonalityId = searchParams.get("personality_id") || undefined
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceLoadingMessageId, setVoiceLoadingMessageId] = useState<string | null>(null)
  const [voiceActiveMessageId, setVoiceActiveMessageId] = useState<string | null>(null)
  const [isVoicePaused, setIsVoicePaused] = useState(false)
  const [user, setUser] = useState<{ username: string; email: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const session = storage.getSession()
    if (!session) {
      router.push("/login")
      return
    }

    // Local-storage onboarding flow (created via /signup) includes a userId.
    if (session.userId) {
      const userData = storage.getUserById(session.userId)
      if (!userData) {
        router.push("/login")
        return
      }

      // Check if user completed onboarding
      if (!storage.hasCompletedOnboarding(session.userId)) {
        router.push("/onboarding/personality")
        return
      }

      setUser({ username: userData.username, email: userData.email })
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Hello ${userData.username}! I'm your personalized AI assistant. I've learned about your personality, attitude, and communication style. How can I help you today?`,
          timestamp: new Date(),
        },
      ])
      return
    }

    // Backend-login flow (via /auth/login) may not have local user records.
    const username = session.username || "User"
    const email = session.email || ""
    setUser({ username, email })

    // Load welcome message
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hello ${username}! How can I help you today?`,
        timestamp: new Date(),
      },
    ])
  }, [router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    const messageText = input
    setInput("")
    setIsLoading(true)

    try {
      const session = storage.getSession()
      const token = session?.accessToken
      if (!token) {
        throw new Error("You are not logged in. Please sign in again.")
      }
      if (!session?.clientId) {
        throw new Error("Missing client_id in session. Please log in again.")
      }

      const resp = await chatWithAssistant({ message: messageText, token, personality_id: activePersonalityId })
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: resp.reply || "",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error("[chat] failed:", error)
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry — I couldn't reach the chat server. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const mimeType =
          mediaRecorderRef.current?.mimeType || chunksRef.current[0]?.type || "audio/webm"
        const blob = new Blob(chunksRef.current, { type: mimeType })
        stream.getTracks().forEach((track) => track.stop())

        // Fire-and-forget transcription (async)
        void (async () => {
          const session = storage.getSession()
          const token = session?.accessToken
          if (!token) {
            alert("Voice transcription requires login (access token). Please sign in again.")
            return
          }

          const ext =
            mimeType.includes("webm") ? "webm" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "dat"
          const filename = `voice.${ext}`

          try {
            setIsTranscribing(true)
            const resp = await transcribeVoice({ audio: blob, filename, token })
            const text = (resp.text || "").trim()
            setInput(text ? text : "")
          } catch (error) {
            console.error("[voice] transcription failed:", error)
            alert("Could not transcribe voice. Check backend is running and OPENAI_API_KEY is set.")
          } finally {
            setIsTranscribing(false)
          }
        })()
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("[v0] Error accessing microphone:", error)
      alert("Could not access microphone. Please check your permissions.")
    }
  }

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  useEffect(() => {
    return () => {
      try {
        audioRef.current?.pause()
      } catch {
        // ignore
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
    }
  }, [])

  const handlePlayVoice = async (messageId: string, text: string) => {
    const session = storage.getSession()
    const token = session?.accessToken
    if (!token) {
      alert("Play Voice requires login (access token). Please sign in again.")
      return
    }

    // Toggle pause/resume if the same message is active
    if (voiceActiveMessageId === messageId && audioRef.current) {
      try {
        if (audioRef.current.paused) {
          await audioRef.current.play()
          setIsVoicePaused(false)
        } else {
          audioRef.current.pause()
          setIsVoicePaused(true)
        }
      } catch (error) {
        console.error("[voice] toggle failed:", error)
      }
      return
    }

    // Stop any currently playing audio and clean up URL
    try {
      audioRef.current?.pause()
    } catch {
      // ignore
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
    audioRef.current = null
    setVoiceActiveMessageId(null)
    setIsVoicePaused(false)

    setVoiceLoadingMessageId(messageId)
    try {
      const blob = await speakVoice({ text, language: "en", token, personality_id: activePersonalityId })
      const url = URL.createObjectURL(blob)
      audioUrlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio
      setVoiceActiveMessageId(messageId)
      setIsVoicePaused(false)
      audio.onended = () => {
        setVoiceActiveMessageId(null)
        setIsVoicePaused(false)
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current)
          audioUrlRef.current = null
        }
      }
      audio.onerror = () => {
        // stop spinner if something goes wrong during playback
        setVoiceLoadingMessageId(null)
        setVoiceActiveMessageId(null)
        setIsVoicePaused(false)
      }

      // Endpoint finished successfully; remove spinner before/while playing.
      setVoiceLoadingMessageId(null)
      await audio.play()
    } catch (error) {
      console.error("[voice] speak failed:", error)
      alert(
        "Could not play voice. Make sure you enrolled voice samples and the backend is running."
      )
      setVoiceLoadingMessageId(null)
      setVoiceActiveMessageId(null)
      setIsVoicePaused(false)
    }
  }

  const handleLogout = () => {
    storage.clearSession()
    router.push("/login")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-5 w-5 text-white"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Personal AI</h1>
              <p className="text-xs text-gray-500">Your Digital Twin</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar>
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 font-medium">
                    {user.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
              <DropdownMenuLabel className="px-2 pb-2 pt-1">
                <div className="text-sm font-semibold text-gray-900">{user.username}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{user.email || "—"}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/personalities" className="w-full">
                  Manage Personalities
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/personalities/famous" className="w-full">
                  Create Famous Personality
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} variant="destructive">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="mr-2 h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                  />
                </svg>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-4 w-4 text-white"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                    />
                  </svg>
                </div>
              )}
              <div className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"} max-w-[80%]`}>
                <Card
                  className={`px-4 py-3 ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                      : "bg-white shadow-sm"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                </Card>
                <div className="mt-1 flex items-center gap-2 px-1">
                  <span className="text-xs text-muted-foreground">
                    {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {message.role === "assistant" && (
                    <button
                      onClick={() => handlePlayVoice(message.id, message.content)}
                      className={`text-muted-foreground hover:text-indigo-600 transition-colors ${
                        voiceLoadingMessageId === message.id ? "opacity-60 pointer-events-none" : ""
                      }`}
                      title={
                        voiceLoadingMessageId === message.id
                          ? "Generating voice..."
                          : voiceActiveMessageId === message.id && !isVoicePaused
                            ? "Pause voice"
                            : "Play voice"
                      }
                      disabled={voiceLoadingMessageId === message.id}
                    >
                      {voiceLoadingMessageId === message.id ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-4 w-4 animate-spin"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            stroke="currentColor"
                            strokeWidth="2"
                            opacity="0.25"
                          />
                          <path
                            d="M21 12a9 9 0 0 0-9-9"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : voiceActiveMessageId === message.id && !isVoicePaused ? (
                        // Pause icon
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M8 6v12" />
                          <path d="M16 6v12" />
                        </svg>
                      ) : voiceActiveMessageId === message.id && isVoicePaused ? (
                        // Resume (play) icon
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="h-4 w-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                          />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {message.role === "user" && (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm font-medium">
                    {user.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-4 w-4 text-white"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                  />
                </svg>
              </div>
              <Card className="bg-white px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-600 [animation-delay:-0.3s]"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-600 [animation-delay:-0.15s]"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-600"></div>
                </div>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t bg-white/80 backdrop-blur-sm p-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message or use voice input..."
                className="min-h-[60px] resize-none pr-12 text-base leading-relaxed"
                disabled={isLoading || isTranscribing}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                className={`absolute bottom-2 right-2 h-8 w-8 ${isRecording ? "text-red-600" : ""}`}
                title={
                  isTranscribing ? "Transcribing..." : isRecording ? "Stop recording" : "Start voice input"
                }
                disabled={isLoading || isTranscribing}
              >
                {isRecording ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-5 w-5 animate-pulse"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-5 w-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                    />
                  </svg>
                )}
              </Button>
            </div>
            <Button onClick={handleSend} size="lg" disabled={!input.trim() || isLoading} className="h-[60px] px-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
