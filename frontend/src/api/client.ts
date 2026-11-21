import axios, { AxiosError } from 'axios'

import { config } from '../config'
import type { ApiErrorBody } from './types'

/** Normalised API failure. `status` is 0 when no HTTP response was received. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
}

function isErrorBody(data: unknown): data is ApiErrorBody {
  if (typeof data !== 'object' || data === null) return false
  const error = (data as { error?: unknown }).error
  return typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (axios.isAxiosError(err)) {
    const response = (err as AxiosError).response
    if (response && isErrorBody(response.data)) {
      const { code, message, details } = response.data.error
      return new ApiError(response.status, code, message, details ?? {})
    }
    if (response) {
      return new ApiError(response.status, 'http_error', `Request failed (${response.status}).`)
    }
    if (err.code === 'ECONNABORTED') {
      return new ApiError(0, 'timeout', 'The server took too long to respond.')
    }
    return new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection.')
  }
  return new ApiError(0, 'unknown_error', 'Something went wrong.')
}

let tokenProvider: () => string | null = () => null

/** The store registers how to read the current JWT; the client never stores it. */
export function setTokenProvider(provider: () => string | null): void {
  tokenProvider = provider
}

export const http = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((request) => {
  const token = tokenProvider()
  if (token) request.headers.set('Authorization', `Bearer ${token}`)
  return request
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
)
