// Use relative URL to go through Next.js proxy (avoids CORS issues)
const API_URL = ''

type ParamValue = string | number | boolean | string[] | undefined

interface FetchOptions extends RequestInit {
  params?: Record<string, ParamValue>
  signal?: AbortSignal
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

/**
 * Sanitizes parameter values to prevent injection.
 * Removes potentially dangerous characters while preserving normal text.
 */
function sanitizeParamValue(value: string): string {
  // Remove null bytes and control characters
  return value.replace(/[\x00-\x1f\x7f]/g, '')
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

  const response = await fetch(url, {
    ...fetchOptions,
    signal,
    credentials: 'include', // Envoie les cookies de session
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
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
