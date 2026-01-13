import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth, type User } from './AuthContext'
import { authApi } from '@/lib/auth'

// Mock auth API
vi.mock('@/lib/auth', () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
  },
}))

const mockUser: User = {
  id: 1,
  email: 'test@example.com',
  fullName: 'Test User',
  role: 'user',
  emailVerified: true,
  twoFactorEnabled: false,
}

// Test component that uses auth context
function TestComponent() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!isAuthenticated) {
    return (
      <div>
        <span>Not authenticated</span>
        <button onClick={() => login('test@example.com', 'password')}>Login</button>
      </div>
    )
  }

  return (
    <div>
      <span>Welcome {user?.email}</span>
      <span>Role: {user?.role}</span>
      <button onClick={logout}>Logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('AuthProvider', () => {
    it('should show loading state initially', async () => {
      // Make me() hang indefinitely
      vi.mocked(authApi.me).mockImplementation(() => new Promise(() => {}))

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should show authenticated state when user is logged in', async () => {
      vi.mocked(authApi.me).mockResolvedValueOnce(mockUser)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByText(`Welcome ${mockUser.email}`)).toBeInTheDocument()
      })
    })

    it('should show not authenticated state when user is not logged in', async () => {
      vi.mocked(authApi.me).mockRejectedValueOnce(new Error('Unauthorized'))

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Not authenticated')).toBeInTheDocument()
      })
    })
  })

  describe('login', () => {
    it('should update user state on successful login', async () => {
      vi.mocked(authApi.me).mockRejectedValueOnce(new Error('Unauthorized'))
      vi.mocked(authApi.login).mockResolvedValueOnce(mockUser)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Not authenticated')).toBeInTheDocument()
      })

      const user = userEvent.setup()
      await user.click(screen.getByText('Login'))

      await waitFor(() => {
        expect(screen.getByText(`Welcome ${mockUser.email}`)).toBeInTheDocument()
      })

      expect(authApi.login).toHaveBeenCalledWith('test@example.com', 'password', undefined, undefined)
    })

    it('should propagate login errors', async () => {
      vi.mocked(authApi.me).mockRejectedValueOnce(new Error('Unauthorized'))
      const loginError = new Error('Invalid credentials')
      vi.mocked(authApi.login).mockRejectedValueOnce(loginError)

      const TestErrorComponent = () => {
        const { login } = useAuth()
        const [error, setError] = React.useState<string | null>(null)

        const handleLogin = async () => {
          try {
            await login('test@example.com', 'wrong-password')
          } catch (err) {
            setError((err as Error).message)
          }
        }

        return (
          <div>
            <button onClick={handleLogin}>Login</button>
            {error && <span>Error: {error}</span>}
          </div>
        )
      }

      const React = await import('react')

      render(
        <AuthProvider>
          <TestErrorComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Login')).toBeInTheDocument()
      })

      const user = userEvent.setup()
      await user.click(screen.getByText('Login'))

      await waitFor(() => {
        expect(screen.getByText('Error: Invalid credentials')).toBeInTheDocument()
      })
    })
  })

  describe('logout', () => {
    it('should clear user state on logout', async () => {
      vi.mocked(authApi.me).mockResolvedValueOnce(mockUser)
      vi.mocked(authApi.logout).mockResolvedValueOnce(undefined)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByText(`Welcome ${mockUser.email}`)).toBeInTheDocument()
      })

      const user = userEvent.setup()
      await user.click(screen.getByText('Logout'))

      await waitFor(() => {
        expect(screen.getByText('Not authenticated')).toBeInTheDocument()
      })
    })

    it('should clear user state even if logout API fails', async () => {
      vi.mocked(authApi.me).mockResolvedValueOnce(mockUser)
      vi.mocked(authApi.logout).mockRejectedValueOnce(new Error('Network error'))

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByText(`Welcome ${mockUser.email}`)).toBeInTheDocument()
      })

      const user = userEvent.setup()
      await user.click(screen.getByText('Logout'))

      // User should be logged out locally even if API fails
      await waitFor(() => {
        expect(screen.getByText('Not authenticated')).toBeInTheDocument()
      })
    })
  })

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestComponent />)
      }).toThrow('useAuth must be used within an AuthProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('user roles', () => {
    it('should correctly identify admin users', async () => {
      const adminUser: User = { ...mockUser, role: 'admin' }
      vi.mocked(authApi.me).mockResolvedValueOnce(adminUser)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Role: admin')).toBeInTheDocument()
      })
    })
  })
})
