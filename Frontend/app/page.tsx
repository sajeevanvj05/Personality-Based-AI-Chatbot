"use client"

import { useEffect, useState } from "react"
import { storage } from "@/lib/storage"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function HomePage() {
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    setHasSession(!!storage.getSession())
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-10 w-10 text-white"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
            />
          </svg>
        </div>
        <h1 className="mb-4 text-balance text-5xl font-bold tracking-tight text-gray-900">
          Your Personalized AI Assistant
        </h1>
        <p className="mb-8 text-pretty text-xl leading-relaxed text-gray-600">
          Experience conversations tailored to your unique personality, communication style, and voice. Create your
          digital twin that understands you perfectly.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          {hasSession ? (
            <>
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <Link href="/chat">Continue to Chat</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base bg-transparent">
                <Link href="/personalities/famous">Create Famous Personality</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <Link href="/signup">Get Started</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base bg-transparent">
                <Link href="/login">Log In</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
