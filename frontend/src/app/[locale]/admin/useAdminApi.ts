'use client'

import { useCallback, useMemo } from 'react'
import { ApiError } from '@/lib/api'

const API_URL = ''

type ParamValue = string | number | boolean | string[] | undefined

interface FetchOptions {
  params?: Record<string, ParamValue>
  signal?: AbortSignal
}

async function fetchWithAuth<T>(
  method: string,
  endpoint: string,
  password: string,
  data?: unknown,
  options: FetchOptions = {}
): Promise<T> {
  const { params, signal } = options

  let url = `${API_URL}/api/v1/soloq/admin${endpoint}`

  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(`${key}[]`, String(v)))
        } else {
          searchParams.append(key, String(value))
        }
      }
    })
    const queryString = searchParams.toString()
    if (queryString) url += `?${queryString}`
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Password': password,
  }

  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
    signal,
  })

  if (!response.ok) {
    let body: unknown
    try { body = await response.json() } catch { /* ignore */ }
    throw new ApiError(response.status, response.statusText, body)
  }

  return response.json()
}

export function useAdminApi(password: string) {
  const get = useCallback(
    <T,>(endpoint: string, options?: FetchOptions) =>
      fetchWithAuth<T>('GET', endpoint, password, undefined, options),
    [password]
  )

  const post = useCallback(
    <T,>(endpoint: string, data?: unknown, options?: FetchOptions) =>
      fetchWithAuth<T>('POST', endpoint, password, data, options),
    [password]
  )

  const patch = useCallback(
    <T,>(endpoint: string, data?: unknown, options?: FetchOptions) =>
      fetchWithAuth<T>('PATCH', endpoint, password, data, options),
    [password]
  )

  const del = useCallback(
    <T,>(endpoint: string, options?: FetchOptions) =>
      fetchWithAuth<T>('DELETE', endpoint, password, undefined, options),
    [password]
  )

  return useMemo(() => ({ get, post, patch, del }), [get, post, patch, del])
}
