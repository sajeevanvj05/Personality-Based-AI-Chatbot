"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { VoiceRecorder } from "@/components/voice-recorder"
import { storage } from "@/lib/storage"
import { enrollVoice } from "@/lib/api"

export default function VoiceOnboardingPage() {
  const router = useRouter()
  const [recordings, setRecordings] = useState<Record<"sample_1" | "sample_2" | "sample_3", Blob | null>>({
    sample_1: null,
    sample_2: null,
    sample_3: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const session = storage.getSession()
    if (!session) {
      router.push("/login")
      return
    }
  }, [router])

  const prompts = useMemo(
    () => [
      {
        id: "sample_1" as const,
        text: "Hi, I am recording this audio sample to help the system learn my voice and create my digital twin.",
      },
      {
        id: "sample_2" as const,
        text: "When I look back at my past experiences, I realize that every challenge was actually an opportunity in disguise.",
      },
      {
        id: "sample_3" as const,
        text: "The specific rhythm, tone, and clear articulation of these words will allow the artificial intelligence to mimic exactly how I speak.",
      },
    ],
    []
  )

  const completedCount = useMemo(() => Object.values(recordings).filter(Boolean).length, [recordings])
  const progress = useMemo(() => (completedCount / 3) * 100, [completedCount])
  const canSubmit = completedCount === 3 && !loading

  const handleSubmit = async () => {
    setLoading(true)
    setError("")
    try {
      const session = storage.getSession()
      if (!session) return
      if (!session.accessToken || !session.clientId) {
        router.push("/login")
        return
      }

      if (!recordings.sample_1 || !recordings.sample_2 || !recordings.sample_3) {
        setError("Please record or upload all 3 samples.")
        return
      }

      await enrollVoice({
        sample1: recordings.sample_1,
        sample2: recordings.sample_2,
        sample3: recordings.sample_3,
        token: session.accessToken,
        filenames: {
          sample1: "sample_1.webm",
          sample2: "sample_2.webm",
          sample3: "sample_3.webm",
        },
      })

      router.push("/chat")
    } catch (error) {
      console.error("[voice] Error enrolling voice:", error)
      const message =
        typeof error === "object" && error && "message" in error && typeof (error as any).message === "string"
          ? (error as any).message
          : "Voice enrollment failed"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
              <span className="text-sm font-bold text-indigo-600">
                {completedCount}/3
              </span>
            </div>
            <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
              Voice Training
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          <CardTitle className="text-2xl font-bold">Train Your Voice</CardTitle>
          <CardDescription className="text-base">
            Record or upload each sentence below. When all 3 are ready, submit to enroll your voice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-8">
            {prompts.map((p, idx) => (
              <div key={p.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900">Sample {idx + 1}</div>
                  {recordings[p.id] ? (
                    <div className="text-xs font-medium text-green-700">Ready</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Pending</div>
                  )}
                </div>
                <VoiceRecorder
                  text={p.text}
                  onRecordingComplete={(blob) => setRecordings((prev) => ({ ...prev, [p.id]: blob }))}
                />
              </div>
            ))}
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full h-12">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                Submitting...
              </span>
            ) : (
              "Submit Voice Samples"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
