import type { User } from '@/contexts/AuthContext'

const AUTH_API_URL = ''

interface LoginResponse {
  success: boolean
  user: User
}

interface RegisterResponse {
  success: boolean
  message: string
  user: User
  verificationToken?: string // Only in development
}

interface AuthError {
  error: string
  attemptsRemaining?: number
  lockedUntil?: string
  requires2FA?: boolean
  userId?: number
}

interface PasswordResetResponse {
  success: boolean
  message: string
  resetToken?: string // Only in development
}

interface TwoFactorSetupResponse {
  success: boolean
  secret: string
  qrCodeUri: string
  message: string
}

interface TwoFactorVerifyResponse {
  success: boolean
  message: string
  recoveryCodes: string[]
  warning: string
}

interface OAuthAccount {
  provider: string
  email: string | null
  linkedAt: string
}

interface AuditLog {
  id: number
  action: string
  ipAddress: string | null
  userAgent: string | null
  success: boolean
  reason: string | null
  createdAt: string
}

async function authFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${AUTH_API_URL}/api/auth${endpoint}`, {
    ...options,
    credentials: 'include', // Important: sends session cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => ({ error: 'Erreur inconnue' }))

  if (!response.ok) {
    const error = new Error(data.error || `Erreur ${response.status}`) as Error & {
      attemptsRemaining?: number
      lockedUntil?: string
      requires2FA?: boolean
      userId?: number
      status?: number
    }
    error.attemptsRemaining = data.attemptsRemaining
    error.lockedUntil = data.lockedUntil
    error.requires2FA = data.requires2FA
    error.userId = data.userId
    error.status = response.status
    throw error
  }

  return data
}

export const authApi = {
  // ==================== Authentication ====================

  login: async (
    email: string,
    password: string,
    twoFactorCode?: string,
    recoveryCode?: string
  ): Promise<User> => {
    const response = await authFetch<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, twoFactorCode, recoveryCode }),
    })
    return response.user
  },

  register: async (
    email: string,
    password: string,
    confirmPassword: string,
    fullName?: string
  ): Promise<RegisterResponse> => {
    return authFetch<RegisterResponse>('/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, confirmPassword, fullName }),
    })
  },

  logout: async (): Promise<void> => {
    await authFetch('/logout', { method: 'POST' })
  },

  me: async (): Promise<User> => {
    return authFetch<User>('/me')
  },

  // ==================== Password Management ====================

  changePassword: async (
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ): Promise<void> => {
    await authFetch('/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
    })
  },

  forgotPassword: async (email: string): Promise<PasswordResetResponse> => {
    return authFetch<PasswordResetResponse>('/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  resetPassword: async (
    token: string,
    password: string,
    confirmPassword: string
  ): Promise<void> => {
    await authFetch('/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password, confirmPassword }),
    })
  },

  // ==================== Email Verification ====================

  verifyEmail: async (token: string): Promise<void> => {
    await authFetch('/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  },

  resendVerification: async (): Promise<void> => {
    await authFetch('/resend-verification', {
      method: 'POST',
    })
  },

  // ==================== Profile ====================

  updateProfile: async (data: { fullName?: string }): Promise<User> => {
    const response = await authFetch<{ success: boolean; user: User }>('/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    return response.user
  },

  getAuditLogs: async (): Promise<AuditLog[]> => {
    return authFetch<AuditLog[]>('/audit-logs')
  },

  // ==================== Two-Factor Authentication ====================

  setup2FA: async (password: string): Promise<TwoFactorSetupResponse> => {
    return authFetch<TwoFactorSetupResponse>('/2fa/setup', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  },

  verify2FA: async (code: string): Promise<TwoFactorVerifyResponse> => {
    return authFetch<TwoFactorVerifyResponse>('/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  },

  disable2FA: async (password: string, code: string): Promise<void> => {
    await authFetch('/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    })
  },

  regenerateRecoveryCodes: async (password: string): Promise<string[]> => {
    const response = await authFetch<{ success: boolean; recoveryCodes: string[] }>(
      '/2fa/recovery-codes',
      {
        method: 'POST',
        body: JSON.stringify({ password }),
      }
    )
    return response.recoveryCodes
  },

  // ==================== OAuth ====================

  getOAuthAccounts: async (): Promise<{ accounts: OAuthAccount[] }> => {
    return authFetch<{ accounts: OAuthAccount[] }>('/oauth/accounts')
  },

  unlinkOAuth: async (provider: string): Promise<void> => {
    await authFetch(`/oauth/${provider}`, {
      method: 'DELETE',
    })
  },

  // OAuth redirect URLs (for button clicks)
  getOAuthUrl: (provider: 'google' | 'github' | 'discord'): string => {
    return `${AUTH_API_URL}/api/auth/oauth/${provider}`
  },
}

// ==================== Admin User Management ====================

export interface AdminUserResponse {
  id: number
  email: string
  fullName: string | null
  role: 'user' | 'admin'
  emailVerified: boolean
  twoFactorEnabled: boolean
  createdAt: string
  lastLoginAt: string | null
  lockedUntil: string | null
  failedLoginAttempts: number
}

export interface CreateUserPayload {
  email: string
  password: string
  fullName?: string
  role?: 'user' | 'admin'
}

export const adminApi = {
  getUsers: async (params?: {
    search?: string
    role?: 'user' | 'admin'
    page?: number
    perPage?: number
  }): Promise<AdminUserResponse[]> => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.set('search', params.search)
    if (params?.role) searchParams.set('role', params.role)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.perPage) searchParams.set('perPage', params.perPage.toString())

    const query = searchParams.toString()
    return authFetch<AdminUserResponse[]>(`/users${query ? `?${query}` : ''}`)
  },

  createUser: async (data: CreateUserPayload): Promise<{ success: boolean; user: AdminUserResponse }> => {
    return authFetch<{ success: boolean; user: AdminUserResponse }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  deleteUser: async (id: number): Promise<void> => {
    await authFetch(`/users/${id}`, { method: 'DELETE' })
  },

  unlockUser: async (id: number): Promise<void> => {
    await authFetch(`/users/${id}/unlock`, { method: 'POST' })
  },
}

export default authApi
