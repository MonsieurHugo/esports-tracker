import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, ApiError } from './api'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('api', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchApi', () => {
    it('should make GET request with correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      })

      await api.get('/test')

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      )
    })

    it('should append query params correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      })

      await api.get('/test', { params: { page: 1, limit: 10 } })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/test?page=1&limit=10',
        expect.any(Object)
      )
    })

    it('should handle array params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      })

      await api.get('/test', { params: { leagues: ['LEC', 'LCK'] } })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('leagues%5B%5D=LEC')
      expect(url).toContain('leagues%5B%5D=LCK')
    })

    it('should skip undefined params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      })

      await api.get('/test', { params: { page: 1, filter: undefined } })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toBe('/api/v1/test?page=1')
      expect(url).not.toContain('filter')
    })
  })

  describe('endpoint validation', () => {
    it('should reject invalid endpoint formats', async () => {
      await expect(api.get('invalid')).rejects.toThrow('Invalid endpoint format')
      await expect(api.get('/test<script>')).rejects.toThrow('Invalid endpoint format')
    })

    it('should accept valid endpoints', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await expect(api.get('/users/123')).resolves.toBeDefined()
    })

    it('should accept endpoints with brackets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await expect(api.get('/test[slug]')).resolves.toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should throw ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Resource not found' }),
      })

      await expect(api.get('/test')).rejects.toThrow(ApiError)
    })

    it('should include status in ApiError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({}),
      })

      let caughtError: ApiError | null = null
      try {
        await api.get('/test')
      } catch (error) {
        caughtError = error as ApiError
      }

      expect(caughtError).toBeInstanceOf(ApiError)
      expect(caughtError?.status).toBe(401)
      expect(caughtError?.isUnauthorized).toBe(true)
    })

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Not JSON') },
      })

      let caughtError: ApiError | null = null
      try {
        await api.get('/test')
      } catch (error) {
        caughtError = error as ApiError
      }

      expect(caughtError).toBeInstanceOf(ApiError)
      expect(caughtError?.status).toBe(500)
      expect(caughtError?.isServerError).toBe(true)
    })
  })

  describe('ApiError', () => {
    it('should have correct helper methods', () => {
      const unauthorized = new ApiError(401, 'Unauthorized')
      expect(unauthorized.isUnauthorized).toBe(true)
      expect(unauthorized.isForbidden).toBe(false)

      const forbidden = new ApiError(403, 'Forbidden')
      expect(forbidden.isForbidden).toBe(true)

      const notFound = new ApiError(404, 'Not Found')
      expect(notFound.isNotFound).toBe(true)

      const serverError = new ApiError(500, 'Internal Server Error')
      expect(serverError.isServerError).toBe(true)
    })
  })

  describe('HTTP methods', () => {
    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      await api.post('/test', { name: 'Test' })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        })
      )
    })

    it('should make PATCH request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      await api.patch('/test/1', { name: 'Updated' })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/test/1',
        expect.objectContaining({
          method: 'PATCH',
        })
      )
    })

    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      await api.delete('/test/1')

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/test/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })

  describe('input sanitization', () => {
    it('should remove control characters from params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await api.get('/test', { params: { search: 'test\x00\x1f' } })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).not.toContain('\x00')
      expect(url).not.toContain('\x1f')
    })
  })

  describe('request deduplication', () => {
    it('should deduplicate GET requests without signal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      })

      // Deux appels simultanés = une seule requête fetch
      const promise1 = api.get('/test')
      const promise2 = api.get('/test')

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(result2)
    })

    it('should deduplicate GET requests with signal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      })

      const controller = new AbortController()

      const promise1 = api.get('/test')
      const promise2 = api.get('/test', { signal: controller.signal })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(result2)
    })

    it('should abort deduplicated request without affecting others', async () => {
      // Créer une promesse qui se résout avec un délai
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ data: 'test' }),
            })
          }, 100)
        })
      })

      const controller = new AbortController()

      const promise1 = api.get('/test')
      const promise2 = api.get('/test', { signal: controller.signal })

      // Abort la deuxième requête
      controller.abort()

      // La deuxième doit être aborted - on vérifie d'abord celle-ci
      await expect(promise2).rejects.toThrow('Aborted')

      // La première doit réussir
      const result1 = await promise1
      expect(result1).toBeDefined()
      expect(result1).toEqual({ data: 'test' })
    })

    it('should reject immediately with already aborted signal', async () => {
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ data: 'test' }),
            })
          }, 100)
        })
      })

      const controller = new AbortController()
      controller.abort()

      // Première requête en cours
      const promise1 = api.get('/test')

      // Deuxième avec signal déjà aborted
      const promise2 = api.get('/test', { signal: controller.signal })

      await expect(promise2).rejects.toThrow('Aborted')
      await expect(promise1).resolves.toBeDefined()
    })

    it('should not deduplicate POST requests', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 2 }),
        })

      const promise1 = api.post('/test', { data: 'test1' })
      const promise2 = api.post('/test', { data: 'test2' })

      await Promise.all([promise1, promise2])

      // Les deux doivent avoir été appelées
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should deduplicate sequential GET requests before first completes', async () => {
      let resolveFirst: (value: unknown) => void
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve
      })

      mockFetch.mockImplementationOnce(() => firstPromise)

      // Première requête
      const promise1 = api.get('/test')

      // Deuxième requête avant que la première ne se termine
      const promise2 = api.get('/test')

      // Une seule requête fetch
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Résoudre maintenant
      resolveFirst!({
        ok: true,
        json: async () => ({ data: 'shared' }),
      })

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(result2)
    })

    it('should make new request after first completes', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: 'first' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: 'second' }),
        })

      // Première requête
      const result1 = await api.get('/test')
      expect(result1).toEqual({ data: 'first' })

      // Deuxième requête après la première
      const result2 = await api.get('/test')
      expect(result2).toEqual({ data: 'second' })

      // Deux appels fetch
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
