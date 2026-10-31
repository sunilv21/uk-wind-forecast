import type { AnalysisResponse, TrendResponse, ProcurementResponse } from '../types/api'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const REQUEST_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function _get<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params)
  const url = `${BASE}${path}?${qs}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)

      if (res.ok) {
        return res.json() as Promise<T>
      }

      // Parse error detail from body
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body?.detail ?? body?.message ?? res.statusText
      } catch {
        // ignore JSON parse failure
      }

      // 4xx errors are not retryable
      if (res.status >= 400 && res.status < 500) {
        throw new ApiError(detail, res.status)
      }

      // 5xx — may be transient
      lastError = new ApiError(
        res.status === 502 || res.status === 503
          ? 'Backend is starting up or temporarily unavailable. Please try again in a moment.'
          : detail,
        res.status,
      )
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof ApiError) throw err   // 4xx — don't retry

      if ((err as Error)?.name === 'AbortError') {
        lastError = new ApiError(
          `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The Elexon API may be slow.`
        )
      } else {
        lastError = new ApiError('Network error — check your connection.')
      }
    }

    // Wait before retrying (only if not last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }

  throw lastError ?? new ApiError('Unexpected error')
}

export function fetchAnalysis(decisionDate: string, cutoffTime: string): Promise<AnalysisResponse> {
  return _get('/api/analysis', { decision_date: decisionDate, cutoff_time: cutoffTime })
}

export function fetchTrend(startDate: string, endDate: string, cutoffTime: string): Promise<TrendResponse> {
  return _get('/api/trend', { start_date: startDate, end_date: endDate, cutoff_time: cutoffTime })
}

export function fetchProcurement(decisionDate: string, cutoffTime: string): Promise<ProcurementResponse> {
  return _get('/api/procurement', { decision_date: decisionDate, cutoff_time: cutoffTime })
}

export async function checkHealth(): Promise<boolean> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${BASE}/api/health`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  }
}
