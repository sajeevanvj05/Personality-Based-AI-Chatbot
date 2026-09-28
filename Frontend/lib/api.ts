export type ApiError = {
  status: number
  message: string
  detail?: unknown
}

function getApiBaseUrl() {
  // Example: NEXT_PUBLIC_API_URL=http://localhost:8000
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "")
}

function buildApiUrl(path: string) {
  const baseUrl = getApiBaseUrl()
  return path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`
}

async function parseError(res: Response): Promise<ApiError> {
  let detail: unknown = undefined
  let message = res.statusText || "Request failed"
  try {
    const json = await res.json()
    detail = json
    if (typeof json?.detail === "string") message = json.detail
    else if (typeof json?.message === "string") message = json.message
  } catch {
    // ignore body parse errors
  }
  return { status: res.status, message, detail }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const url = buildApiUrl(path)

  const headers = new Headers(options.headers)
  if (options.json !== undefined) headers.set("Content-Type", "application/json")

  const res = await fetch(url, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  })

  if (!res.ok) {
    throw await parseError(res)
  }

  return (await res.json()) as T
}

export type LoginRequest = { username: string; password: string }
export type LoginResponse = {
  message: string
  access_token: string
  token_type: "bearer" | string
  client_id?: string | null
  username?: string | null
}

export async function login(req: LoginRequest) {
  return apiFetch<LoginResponse>("/auth/login", { method: "POST", json: req })
}

export type SignupRequest = { username: string; email: string; password: string }
export type SignupResponse = {
  message: string
  user: {
    _id: string
    username: string
    email: string
    client_id: string
  }
}

export async function signup(req: SignupRequest) {
  return apiFetch<SignupResponse>("/auth/signup", { method: "POST", json: req })
}

export type VoiceToTextResponse = { text: string }

export async function transcribeVoice(params: { audio: Blob; filename?: string; token?: string }) {
  const url = buildApiUrl("/voice/transcribe")
  const form = new FormData()
  form.append("audio", params.audio, params.filename || "audio.webm")

  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)

  const res = await fetch(url, { method: "POST", body: form, headers })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as VoiceToTextResponse
}

export type VoiceEnrollResponse = {
  message: string
  profile: {
    _id: string
    client_id: string
    language: string
    status: string
  }
}

export async function enrollVoice(params: {
  sample1: Blob
  sample2: Blob
  sample3: Blob
  token?: string
  filenames?: { sample1?: string; sample2?: string; sample3?: string }
}) {
  const url = buildApiUrl("/voice/enroll")
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)

  const form = new FormData()
  form.append("sample1", params.sample1, params.filenames?.sample1 || "sample_1.webm")
  form.append("sample2", params.sample2, params.filenames?.sample2 || "sample_2.webm")
  form.append("sample3", params.sample3, params.filenames?.sample3 || "sample_3.webm")

  const res = await fetch(url, { method: "POST", body: form, headers })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as VoiceEnrollResponse
}

export async function speakVoice(params: { text: string; language?: string; token?: string; personality_id?: string }) {
  const url = buildApiUrl("/voice/speak")
  const headers = new Headers()
  headers.set("Content-Type", "application/json")
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: params.text, language: params.language || "en", personality_id: params.personality_id }),
  })

  if (!res.ok) throw await parseError(res)
  return await res.blob()
}

export type FamousVoiceEnrollResponse = VoiceEnrollResponse

export async function enrollFamousVoice(params: {
  personality_id: string
  clip1: Blob
  clip2: Blob
  token?: string
  filenames?: { clip1?: string; clip2?: string }
}) {
  const url = buildApiUrl("/voice/enroll/famous")
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)

  const form = new FormData()
  form.append("personality_id", params.personality_id)
  form.append("clip1", params.clip1, params.filenames?.clip1 || "clip_1.wav")
  form.append("clip2", params.clip2, params.filenames?.clip2 || "clip_2.wav")

  const res = await fetch(url, { method: "POST", body: form, headers })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as FamousVoiceEnrollResponse
}

export type ChatRequest = { message: string }
export type ChatResponse = { reply: string }

export async function chatWithAssistant(params: { message: string; token?: string; personality_id?: string }) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  const qs = params.personality_id ? `?personality_id=${encodeURIComponent(params.personality_id)}` : ""
  return apiFetch<ChatResponse>(`/chat${qs}`, {
    method: "POST",
    json: { message: params.message } satisfies ChatRequest,
    headers,
  })
}

export type PersonalityQuestion = { question_id: string; part: string; question: string }
export type PersonalityQuestionsResponse = { question_set_id: string; personality_id: string; questions: PersonalityQuestion[] }

export async function getPersonalityQuestions(params: { token?: string } = {}) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  return apiFetch<PersonalityQuestionsResponse>("/personality/questions", { method: "GET", headers })
}

export type PersonalityAnswerIn = { question_id: string; answer: string }
export type PersonalitySubmitResponse = { message: string }

export async function submitPersonalityAnswers(params: {
  question_set_id: string
  answers: PersonalityAnswerIn[]
  token?: string
}) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  return apiFetch<PersonalitySubmitResponse>("/personality/answers", {
    method: "POST",
    json: { question_set_id: params.question_set_id, answers: params.answers },
    headers,
  })
}

export type PersonalityProfile = {
  _id: string
  client_id: string
  personality_id: string
  display_name?: string | null
  created_at: string
}

export type PersonalityProfilesResponse = { profiles: PersonalityProfile[] }

export async function getPersonalityProfiles(params: { token?: string } = {}) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  return apiFetch<PersonalityProfilesResponse>("/personality/profiles", { method: "GET", headers })
}

export type UpdatePersonalityNameRequest = { display_name: string }
export type UpdatePersonalityNameResponse = { message: string; profile: PersonalityProfile }

export async function updatePersonalityName(params: { personality_id: string; display_name: string; token?: string }) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  return apiFetch<UpdatePersonalityNameResponse>(`/personality/profiles/${encodeURIComponent(params.personality_id)}`, {
    method: "PATCH",
    json: { display_name: params.display_name } satisfies UpdatePersonalityNameRequest,
    headers,
  })
}

export type FamousPersonalityStartRequest = { famous_name: string; display_name?: string | null }
export type FamousPersonalityStartResponse = {
  message: string
  personality_id: string
  session_id: string
  famous_name: string
  reply: string
}

export async function startFamousPersonality(params: { req: FamousPersonalityStartRequest; token?: string }) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  return apiFetch<FamousPersonalityStartResponse>("/personality/famous/start", {
    method: "POST",
    json: params.req,
    headers,
  })
}

export type FamousPersonalityChatRequest = { personality_id: string; message: string }
export type FamousPersonalityChatResponse = { personality_id: string; session_id: string; reply: string }

export async function chatFamousPersonality(params: { req: FamousPersonalityChatRequest; token?: string }) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  return apiFetch<FamousPersonalityChatResponse>("/personality/famous/chat", {
    method: "POST",
    json: params.req,
    headers,
  })
}

export type FamousPersonalityGeneratePromptRequest = { personality_id: string }
export type FamousPersonalityGeneratePromptResponse = { message: string; personality_id: string; prompt: { _id: string } }

export async function generateFamousPersonalitySystemPrompt(params: {
  req: FamousPersonalityGeneratePromptRequest
  token?: string
}) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  return apiFetch<FamousPersonalityGeneratePromptResponse>("/personality/famous/system-prompt/generate", {
    method: "POST",
    json: params.req,
    headers,
  })
}

export type IdentifyFamousPersonRequest = { text: string }
export type IdentifyFamousPersonCandidate = { name: string; confidence: number; reason: string; notes?: string | null }
export type IdentifyFamousPersonResponse = {
  best_guess_name: string
  candidates: IdentifyFamousPersonCandidate[]
  needs_more_info: boolean
  followup_question?: string | null
}

export async function identifyFamousPerson(params: { req: IdentifyFamousPersonRequest; token?: string }) {
  const headers = new Headers()
  if (params.token) headers.set("Authorization", `Bearer ${params.token}`)
  return apiFetch<IdentifyFamousPersonResponse>("/personality/famous/identify", {
    method: "POST",
    json: params.req,
    headers,
  })
}


