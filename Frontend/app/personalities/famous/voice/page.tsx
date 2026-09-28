"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { storage } from "@/lib/storage"
import { enrollFamousVoice } from "@/lib/api"

type ClipKey = "clip_1" | "clip_2"
type ClipState = { blob: Blob | null; durationSec: number | null; url: string | null }

async function getBlobDurationSeconds(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob)
  try {
    const audio = document.createElement("audio")
    audio.preload = "metadata"
    audio.src = url
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve()
      audio.onerror = () => reject(new Error("Could not read audio metadata"))
    })
    const d = Number(audio.duration)
    if (!Number.isFinite(d) || d <= 0) throw new Error("Invalid audio duration")
    return d
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function FamousPersonalityVoicePage() {
  const router = useRouter()
  const params = useSearchParams()
  const personalityId = params.get("personality_id") || ""

  const [clips, setClips] = useState<Record<ClipKey, ClipState>>({
    clip_1: { blob: null, durationSec: null, url: null },
    clip_2: { blob: null, durationSec: null, url: null },
  })
  const [recordingKey, setRecordingKey] = useState<ClipKey | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const session = storage.getSession()
    if (!session) {
      router.push("/login")
      return
    }
    if (!personalityId) {
      router.push("/personalities/famous")
      return
    }
  }, [router, personalityId])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      // cleanup blob urls
      for (const k of ["clip_1", "clip_2"] as ClipKey[]) {
        const u = clips[k].url
        if (u) URL.revokeObjectURL(u)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const completedCount = useMemo(() => (clips.clip_1.blob ? 1 : 0) + (clips.clip_2.blob ? 1 : 0), [clips])
  const progress = useMemo(() => (completedCount / 2) * 100, [completedCount])
  const canSubmit = useMemo(() => completedCount === 2 && !loading && !recordingKey, [completedCount, loading, recordingKey])

  const startRecording = async (key: ClipKey) => {
    setError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      setRecordingKey(key)
      setRecordingTime(0)

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        try {
          const mime = mr.mimeType || "audio/webm"
          const blob = new Blob(chunksRef.current, { type: mime })
          const duration = await getBlobDurationSeconds(blob)
          if (duration < 9.5) {
            setError("Each clip must be about 10 seconds. Please record again.")
            return
          }
          setClips((prev) => {
            if (prev[key].url) URL.revokeObjectURL(prev[key].url)
            const url = URL.createObjectURL(blob)
            return { ...prev, [key]: { blob, durationSec: duration, url } }
          })
        } catch (e) {
          setError("Could not process recording. Please try again.")
        } finally {
          stream.getTracks().forEach((t) => t.stop())
          streamRef.current = null
          setRecordingKey(null)
        }
      }

      mr.start()
      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => {
          const next = t + 1
          if (next >= 10) {
            // auto-stop at 10 seconds
            try {
              mr.stop()
            } catch {
              // ignore
            }
            if (timerRef.current) window.clearInterval(timerRef.current)
            timerRef.current = null
          }
          return next
        })
      }, 1000)
    } catch (e) {
      setError("Could not access microphone. Please check your permissions.")
      setRecordingKey(null)
    }
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    if (!mr || !recordingKey) return
    try {
      mr.stop()
    } catch {
      // ignore
    }
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const uploadFile = async (key: ClipKey, file: File) => {
    setError("")
    try {
      const duration = await getBlobDurationSeconds(file)
      if (duration < 9.5) {
        setError("Each clip must be about 10 seconds. Please upload a longer clip.")
        return
      }
      setClips((prev) => {
        if (prev[key].url) URL.revokeObjectURL(prev[key].url)
        const url = URL.createObjectURL(file)
        return { ...prev, [key]: { blob: file, durationSec: duration, url } }
      })
    } catch {
      setError("Could not read that audio file. Try another file.")
    }
  }

  const submit = async () => {
    setLoading(true)
    setError("")
    try {
      const token = storage.getSession()?.accessToken
      if (!token) {
        router.push("/login")
        return
      }
      if (!clips.clip_1.blob || !clips.clip_2.blob) {
        setError("Please provide both voice clips.")
        return
      }
      await enrollFamousVoice({
        personality_id: personalityId,
        clip1: clips.clip_1.blob,
        clip2: clips.clip_2.blob,
        token,
        filenames: { clip1: "clip_1.wav", clip2: "clip_2.wav" },
      })
      router.push(`/chat?personality_id=${encodeURIComponent(personalityId)}`)
    } catch (e) {
      setError("Voice upload failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const ClipCard = ({ k, label }: { k: ClipKey; label: string }) => {
    const state = clips[k]
    const isRec = recordingKey === k
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-900">{label}</div>
          {state.blob ? (
            <div className="text-xs font-medium text-green-700">Ready</div>
          ) : isRec ? (
            <div className="text-xs font-medium text-red-600">Recording… {recordingTime}/10s</div>
          ) : (
            <div className="text-xs text-muted-foreground">Pending</div>
          )}
        </div>

        <Card className="bg-indigo-50 p-4">
          <p className="text-sm text-gray-900">
            Record a clean 10 second clip (no background noise). You can also upload an audio file.
          </p>
          {state.durationSec ? (
            <p className="mt-1 text-xs text-muted-foreground">Duration: {state.durationSec.toFixed(1)}s</p>
          ) : null}
        </Card>

        {state.url ? <audio controls src={state.url} className="w-full" /> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          {!isRec ? (
            <Button onClick={() => startRecording(k)} disabled={!!recordingKey || loading} className="flex-1 h-12">
              Start Recording (10s)
            </Button>
          ) : (
            <Button onClick={stopRecording} variant="destructive" disabled={loading} className="flex-1 h-12">
              Stop
            </Button>
          )}
          <label className="flex-1">
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              disabled={!!recordingKey || loading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                void uploadFile(k, f)
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 bg-transparent"
              disabled={!!recordingKey || loading}
              onClick={(e) => {
                const input = (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null) || null
                input?.click()
              }}
            >
              Upload Clip
            </Button>
          </label>
        </div>

        {state.blob ? (
          <Button
            type="button"
            variant="outline"
            className="w-full bg-transparent"
            disabled={!!recordingKey || loading}
            onClick={() =>
              setClips((prev) => {
                if (prev[k].url) URL.revokeObjectURL(prev[k].url!)
                return { ...prev, [k]: { blob: null, durationSec: null, url: null } }
              })
            }
          >
            Re-do this clip
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-2xl shadow-xl">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                <span className="text-sm font-bold text-indigo-600">{completedCount}/2</span>
              </div>
              <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">Famous Voice</div>
            </div>
            <Progress value={progress} className="h-2" />
            <CardTitle className="text-2xl font-bold">Upload voice for this personality</CardTitle>
            <CardDescription className="text-base">
              Please provide <span className="font-medium">2 voice clips</span>, about <span className="font-medium">10 seconds</span> each.
              This voice will be used only for this famous personality.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-8">
              <ClipCard k="clip_1" label="Clip 1" />
              <ClipCard k="clip_2" label="Clip 2" />
            </div>

            {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="flex-1 bg-transparent" disabled={loading || !!recordingKey}>
                <Link href="/personalities">Back</Link>
              </Button>
              <Button onClick={submit} disabled={!canSubmit} className="flex-1 h-12">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                    Uploading...
                  </span>
                ) : (
                  "Save Voice Clips"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  )
}


