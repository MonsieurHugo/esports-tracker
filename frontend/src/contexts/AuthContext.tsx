'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { authApi } from '@/lib/auth'

export interface User {
  id: number
  email: string
  fullName: string | null
  role: 'user' | 'admin'
  emailVerified: boolean
  twoFactorEnabled: boolean
}

interface LoginError extends Error {
  attemptsRemaining?: number
  lockedUntil?: string
  requires2FA?: boolean
  userId?: number
  status?: number
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (
    email: string,
    password: string,
    twoFactorCode?: string,
    recoveryCode?: string
  ) => Promise<void>
  register: (
    email: string,
    password: string,
    confirmPassword: string,
    fullName?: string
  ) => Promise<{ message: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  updateProfile: (data: { fullName?: string }) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const userData = await authApi.me()
      setUser(userData)
    } catch {
      // User is not authenticated - this is expected for unauthenticated visitors
      // No logging needed as this is normal for unauthenticated visitors
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (
    email: string,
    password: string,
    twoFactorCode?: string,
    recoveryCode?: string
  ) => {
    try {
      const userData = await authApi.login(email, password, twoFactorCode, recoveryCode)
      setUser(userData)
    } catch (error) {
      // Re-throw with additional info for handling 2FA requirement
      throw error
    }
  }, [])

  const register = useCallback(async (
    email: string,
    password: string,
    confirmPassword: string,
    fullName?: string
  ) => {
    const response = await authApi.register(email, password, confirmPassword, fullName)
    // Don't set user after registration - they need to verify email first (or login)
    return { message: response.message }
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const updateProfile = useCallback(async (data: { fullName?: string }) => {
    const updatedUser = await authApi.updateProfile(data)
    setUser(updatedUser)
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
