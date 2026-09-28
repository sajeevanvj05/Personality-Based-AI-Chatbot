"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { storage } from "@/lib/storage"
import { getPersonalityQuestions, submitPersonalityAnswers, updatePersonalityName } from "@/lib/api"

export default function PersonalityOnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [currentAnswer, setCurrentAnswer] = useState("")
  const [loading, setLoading] = useState(false)
  const [questionsLoading, setQuestionsLoading] = useState(true)
  const [questionsError, setQuestionsError] = useState("")
  const [questions, setQuestions] = useState<{ question_id: string; part: string; question: string }[]>([])
  const [questionSetId, setQuestionSetId] = useState<string>("")
  const [personalityId, setPersonalityId] = useState<string>("")
  const [showNameStep, setShowNameStep] = useState(false)
  const [personalityName, setPersonalityName] = useState("Default")
  const [answersSubmitting, setAnswersSubmitting] = useState(false)

  useEffect(() => {
    const session = storage.getSession()
    if (!session) {
      router.push("/login")
      return
    }
  }, [router])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        setQuestionsLoading(true)
        setQuestionsError("")
        const session = storage.getSession()
        const resp = await getPersonalityQuestions({ token: session?.accessToken })
        if (!mounted) return
        setQuestions(resp.questions || [])
        setQuestionSetId(resp.question_set_id || "")
        setPersonalityId(resp.personality_id || "")
      } catch (e) {
        if (!mounted) return
        setQuestionsError("Could not load questions. Please refresh.")
      } finally {
        if (!mounted) return
        setQuestionsLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const currentQuestion = questions[currentStep]
  const totalQuestions = questions.length || 1
  const progress = useMemo(() => {
    if (!questions.length) return 0
    return ((currentStep + 1) / questions.length) * 100
  }, [currentStep, questions.length])

  const isFinalQuestion = useMemo(() => !!questions.length && currentStep === questions.length - 1, [currentStep, questions.length])
  const isMinimalHeader = questionsLoading || showNameStep || answersSubmitting

  const handleNext = () => {
    if (!currentAnswer.trim()) {
      return
    }

    if (!currentQuestion) return
    const newAnswers = { ...answers, [currentQuestion.question_id]: currentAnswer }
    setAnswers(newAnswers)
    setCurrentAnswer("")

    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleSubmit(newAnswers)
    }
  }

  const handleSubmit = async (finalAnswers: Record<string, string>) => {
    setLoading(true)
    setAnswersSubmitting(true)
    try {
      const session = storage.getSession()
      if (!session) return
      if (!session.accessToken || !session.clientId) {
        router.push("/login")
        return
      }
      if (!questionSetId) {
        setQuestionsError("Could not submit because question set is missing. Please refresh.")
        return
      }

      const answersList = Object.entries(finalAnswers).map(([question_id, answer]) => ({
        question_id,
        answer,
      }))

      await submitPersonalityAnswers({ question_set_id: questionSetId, answers: answersList, token: session.accessToken })

      // After completing questions, let the user name this personality.
      setShowNameStep(true)
    } catch (error) {
      console.error("[v0] Error saving personality answers:", error)
    } finally {
      setLoading(false)
      setAnswersSubmitting(false)
    }
  }

  const handleSaveName = async () => {
    setLoading(true)
    setQuestionsError("")
    try {
      const session = storage.getSession()
      if (!session?.accessToken) {
        router.push("/login")
        return
      }
      if (!personalityId) {
        setQuestionsError("Missing personality_id. Please refresh and try again.")
        return
      }
      const name = personalityName.trim()
      if (!name) return
      await updatePersonalityName({ personality_id: personalityId, display_name: name, token: session.accessToken })
      router.push("/onboarding/voice")
    } catch (e) {
      setQuestionsError("Could not save personality name. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      const prev = questions[currentStep - 1]
      if (prev) setCurrentAnswer(answers[prev.question_id] || "")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="space-y-4">
          {!isMinimalHeader ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                  <span className="text-sm font-bold text-indigo-600">
                    {Math.min(currentStep + 1, totalQuestions)}/{totalQuestions}
                  </span>
                </div>
                <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
                  {currentQuestion?.part || "Personality"}
                </div>
              </div>
              <Progress value={progress} className="h-2" />
              <CardTitle className="text-2xl font-bold leading-tight">Let's get to know you better</CardTitle>
              <CardDescription className="text-base">
                Your answers help us create a personalized AI that truly understands you
              </CardDescription>
            </>
          ) : (
            <>
              <Progress value={showNameStep ? 100 : answersSubmitting ? 100 : 0} className="h-2" />
              <CardTitle className="text-2xl font-bold leading-tight">
                {questionsLoading ? "Preparing your questions" : answersSubmitting ? "Saving your answers" : "Name your personality"}
              </CardTitle>
              <CardDescription className="text-base">
                {questionsLoading
                  ? "We’re generating a short set of questions to understand your communication style and preferences."
                  : answersSubmitting
                    ? "Please wait a moment while we save your responses."
                    : "Give this personality a name so you can find it later."}
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {questionsLoading ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-indigo-50 p-6">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-3/4 bg-indigo-200/50" />
                  <Skeleton className="h-5 w-5/6 bg-indigo-200/40" />
                  <Skeleton className="h-5 w-2/3 bg-indigo-200/40" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-[180px] w-full bg-gray-200/60" />
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Loading your personalized questions…</p>
                </div>
              </div>
            </div>
          ) : answersSubmitting ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-indigo-50 p-6">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-2/3 bg-indigo-200/50" />
                  <Skeleton className="h-5 w-5/6 bg-indigo-200/40" />
                  <Skeleton className="h-5 w-3/4 bg-indigo-200/40" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-[180px] w-full bg-gray-200/60" />
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Submitting your answers…</p>
                </div>
              </div>
            </div>
          ) : questionsError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{questionsError}</div>
          ) : showNameStep ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-indigo-50 p-6">
                <h3 className="text-lg font-medium leading-relaxed text-gray-900">Name your personality</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your new personality is currently named <span className="font-medium">Default</span>. You can rename it now (optional).
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-900">Personality name</div>
                <Input
                  value={personalityName}
                  onChange={(e) => setPersonalityName(e.target.value)}
                  placeholder="e.g., Work mode, Friendly tone, Minimalist"
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">You can change this later from the Personalities page.</p>
              </div>
            </div>
          ) : !currentQuestion ? (
            <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">No questions available.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-indigo-50 p-6">
                <h3 className="text-lg font-medium leading-relaxed text-gray-900">{currentQuestion.question}</h3>
              </div>
              <Textarea
                placeholder="Type your answer..."
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                className="min-h-[180px] resize-none text-base leading-relaxed"
              />
              <p className="text-sm text-muted-foreground">
                Take your time and be as detailed as you like. The more we know, the better we can personalize your
                experience.
              </p>
            </div>
          )}
          {!questionsLoading && !showNameStep && !answersSubmitting ? (
            <div className="flex gap-3">
              {currentStep > 0 && (
                <Button variant="outline" onClick={handleBack} className="flex-1 bg-transparent">
                  Back
                </Button>
              )}
              <Button
                onClick={handleNext}
                disabled={!currentAnswer.trim() || loading || questionsLoading || !!questionsError || !currentQuestion}
                className="flex-1"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                    {isFinalQuestion ? "Submitting..." : "Saving..."}
                  </span>
                ) : currentStep < questions.length - 1 ? (
                  "Continue"
                ) : (
                  "Submit"
                )}
              </Button>
            </div>
          ) : null}

          {!questionsLoading && showNameStep ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 bg-transparent"
                disabled={loading}
                onClick={() => router.push("/onboarding/voice")}
              >
                Skip
              </Button>
              <Button className="flex-1" disabled={loading || !personalityName.trim()} onClick={handleSaveName}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                    Saving...
                  </span>
                ) : (
                  "Save Name"
                )}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
