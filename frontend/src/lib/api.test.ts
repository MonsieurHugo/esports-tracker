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

      try {
        await api.get('/test')
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).status).toBe(401)
        expect((error as ApiError).isUnauthorized).toBe(true)
      }
    })

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Not JSON') },
      })

      await expect(api.get('/test')).rejects.toThrow(ApiError)
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
})
