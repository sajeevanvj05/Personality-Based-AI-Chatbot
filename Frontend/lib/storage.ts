// Client-side storage utilities for user data
export interface UserData {
  id: string
  username: string
  email: string
  password: string
  personalityAnswers?: Record<string, string>
  voiceRecordings?: {
    text_1?: string
    text_2?: string
    text_3?: string
  }
  createdAt: string
}

export interface SessionData {
  userId?: string
  username: string
  email?: string
  accessToken?: string
  tokenType?: string
  clientId?: string
}

export const storage = {
  // User management
  createUser: (username: string, email: string, password: string): UserData => {
    const users = storage.getAllUsers()

    // Check if user exists
    if (users.find((u) => u.email === email)) {
      throw new Error("User with this email already exists")
    }

    const newUser: UserData = {
      id: crypto.randomUUID(),
      username,
      email,
      password, // In production, this should be hashed
      createdAt: new Date().toISOString(),
    }

    users.push(newUser)
    localStorage.setItem("users", JSON.stringify(users))
    return newUser
  },

  getAllUsers: (): UserData[] => {
    const users = localStorage.getItem("users")
    return users ? JSON.parse(users) : []
  },

  getUserByEmail: (email: string): UserData | null => {
    const users = storage.getAllUsers()
    return users.find((u) => u.email === email) || null
  },

  getUserById: (id: string): UserData | null => {
    const users = storage.getAllUsers()
    return users.find((u) => u.id === id) || null
  },

  updateUser: (userId: string, updates: Partial<UserData>): UserData => {
    const users = storage.getAllUsers()
    const index = users.findIndex((u) => u.id === userId)

    if (index === -1) {
      throw new Error("User not found")
    }

    users[index] = { ...users[index], ...updates }
    localStorage.setItem("users", JSON.stringify(users))
    return users[index]
  },

  // Session management
  createSession: (userOrSession: UserData | SessionData): void => {
    // Backwards compatible: can accept a full user or a session payload.
    const session: SessionData =
      "id" in userOrSession
        ? {
            userId: userOrSession.id,
            username: userOrSession.username,
            email: userOrSession.email,
          }
        : userOrSession

    localStorage.setItem("session", JSON.stringify(session))
  },

  getSession: (): SessionData | null => {
    const session = localStorage.getItem("session")
    return session ? JSON.parse(session) : null
  },

  clearSession: (): void => {
    localStorage.removeItem("session")
  },

  // Check if user has completed onboarding
  hasCompletedOnboarding: (userId: string): boolean => {
    const user = storage.getUserById(userId)
    if (!user) return false

    return !!(
      user.personalityAnswers &&
      Object.keys(user.personalityAnswers).length >= 3 &&
      user.voiceRecordings &&
      user.voiceRecordings.text_1 &&
      user.voiceRecordings.text_2 &&
      user.voiceRecordings.text_3
    )
  },
}
