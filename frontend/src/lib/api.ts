// Use relative URL to go through Next.js proxy (avoids CORS issues)
const API_URL = ''

type ParamValue = string | number | boolean | string[] | undefined

interface FetchOptions extends RequestInit {
  params?: Record<string, ParamValue>
  signal?: AbortSignal
}

/**
 * In-flight request cache to deduplicate concurrent identical GET requests.
 * Key: cache key (method + url), Value: Promise of the response
 */
const inflightRequests = new Map<string, Promise<unknown>>()

/**
 * Generates a cache key for request deduplication.
 */
function getCacheKey(method: string, url: string): string {
  return `${method}:${url}`
}

/**
 * Custom API error with structured information.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: unknown
  ) {
    super(`API Error: ${status} ${statusText}`)
    this.name = 'ApiError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isServerError(): boolean {
    return this.status >= 500
  }
}

/**
 * Validates endpoint format to prevent injection attacks.
 * Allows only alphanumeric characters, slashes, hyphens, underscores, and brackets.
 */
function validateEndpoint(endpoint: string): void {
  if (!/^\/[a-zA-Z0-9\/_\-\[\]]*$/.test(endpoint)) {
    throw new Error(`Invalid endpoint format: ${endpoint}`)
  }
}

const MAX_PARAM_LENGTH = 500

/**
 * Sanitizes parameter values to prevent injection.
 * Removes potentially dangerous characters while preserving normal text.
 */
function sanitizeParamValue(value: string): string {
  if (typeof value !== 'string') {
    return ''
  }
  const truncated = value.slice(0, MAX_PARAM_LENGTH)
  return truncated.replace(/[\x00-\x1f\x7f]/g, '')
}

/**
 * Retrieves the CSRF token from cookies or meta tag for protection against CSRF attacks.
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null

  // Option 1: from XSRF-TOKEN cookie (common pattern with frameworks like AdonisJS, Laravel)
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/)
  if (match) return decodeURIComponent(match[1])

  // Option 2: from meta tag
  const meta = document.querySelector('meta[name="csrf-token"]')
  return meta?.getAttribute('content') || null
}

async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  // Validate endpoint format
  validateEndpoint(endpoint)

  const { params, signal, ...fetchOptions } = options

  let url = `${API_URL}/api/v1${endpoint}`

  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          // Support array params like leagues[]=LEC&leagues[]=LCK
          value.forEach((v) => searchParams.append(`${key}[]`, sanitizeParamValue(String(v))))
        } else {
          searchParams.append(key, sanitizeParamValue(String(value)))
        }
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }
  }

  // Build headers with CSRF token for mutation requests
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }

  // Add CSRF token for mutation methods to protect against CSRF attacks
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
  }

  // Deduplicate concurrent identical GET requests
  const cacheKey = getCacheKey(method, url)
  if (method === 'GET' && inflightRequests.has(cacheKey)) {
    const existingPromise = inflightRequests.get(cacheKey) as Promise<T>

    // Si pas de signal, retourne directement la promesse existante
    if (!signal) {
      return existingPromise
    }

    // Avec signal: lie l'abort à la requête dédupliquée
    return new Promise<T>((resolve, reject) => {
      // Handler pour l'abort
      const abortHandler = () => {
        reject(new DOMException('Aborted', 'AbortError'))
      }

      // Vérifie si déjà aborted
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }

      // Écoute l'abort
      signal.addEventListener('abort', abortHandler, { once: true })

      // Attend la promesse existante
      existingPromise
        .then((result) => {
          signal.removeEventListener('abort', abortHandler)
          if (!signal.aborted) {
            resolve(result)
          }
        })
        .catch((error) => {
          signal.removeEventListener('abort', abortHandler)
          if (!signal.aborted) {
            reject(error)
          }
        })
    })
  }

  const fetchPromise = (async () => {
    const response = await fetch(url, {
      ...fetchOptions,
      signal,
      credentials: 'include', // Envoie les cookies de session
      headers,
    })

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        // Body is not JSON, ignore
      }
      throw new ApiError(response.status, response.statusText, body)
    }

    return response.json()
  })()

  // Cache GET requests
  if (method === 'GET') {
    inflightRequests.set(cacheKey, fetchPromise)

    // Cleanup on completion
    fetchPromise.finally(() => {
      inflightRequests.delete(cacheKey)
    })

    // Cleanup on abort to prevent memory leak
    if (signal) {
      signal.addEventListener('abort', () => {
        inflightRequests.delete(cacheKey)
      }, { once: true })
    }
  }

  return fetchPromise as Promise<T>
}

export const api = {
  get: <T>(endpoint: string, options?: FetchOptions) =>
    fetchApi<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string, options?: FetchOptions) =>
    fetchApi<T>(endpoint, { ...options, method: 'DELETE' }),
}

export default api
