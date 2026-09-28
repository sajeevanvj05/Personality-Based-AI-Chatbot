"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { storage } from "@/lib/storage"
import { getPersonalityProfiles, type PersonalityProfile } from "@/lib/api"

export default function PersonalitiesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [profiles, setProfiles] = useState<PersonalityProfile[]>([])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        setLoading(true)
        setError("")
        const token = storage.getSession()?.accessToken
        if (!token) {
          router.push("/login")
          return
        }
        const resp = await getPersonalityProfiles({ token })
        if (!mounted) return
        setProfiles(resp.profiles || [])
      } catch (e) {
        if (!mounted) return
        setError("Could not load personalities. Please refresh.")
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [router])

  const formatName = (p: PersonalityProfile) => {
    const name = (p.display_name || "").trim()
    if (name) return name
    return `Personality ${p.personality_id.slice(0, 6)}`
  }

  const sorted = useMemo(() => profiles, [profiles])

  const selectPersonality = (personalityId: string) => {
    router.push(`/chat?personality_id=${encodeURIComponent(personalityId)}`)
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Your Personalities</h1>
              <p className="text-sm text-muted-foreground">Select one to chat with, or create a new personality.</p>
            </div>
            <Button asChild variant="outline" className="bg-transparent">
              <Link href="/chat">Back to Chat</Link>
            </Button>
          </div>

          {loading ? (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Loading</CardTitle>
                <CardDescription>Fetching your saved personalities…</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-14 w-full bg-gray-200/60" />
                <Skeleton className="h-14 w-full bg-gray-200/60" />
                <Skeleton className="h-14 w-full bg-gray-200/60" />
              </CardContent>
            </Card>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sorted.length ? (
                sorted.map((p) => (
                  <Card key={p.personality_id} className="shadow-sm">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-base">{formatName(p)}</CardTitle>
                      <CardDescription className="text-xs">ID: {p.personality_id}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => selectPersonality(p.personality_id)} className="w-full">
                        Chat with this personality
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="shadow-sm md:col-span-2">
                  <CardHeader>
                    <CardTitle>No personalities yet</CardTitle>
                    <CardDescription>Create one using questions or a famous person.</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          )}

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Add a new personality</CardTitle>
              <CardDescription>Choose how you want to create it.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1">
                <Link href="/onboarding/personality">Add Own Personality</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1 bg-transparent">
                <Link href="/personalities/famous">Famous Person Personality</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  )
}


