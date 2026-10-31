import type { AnalysisResponse, TrendResponse, ProcurementResponse } from '../types/api'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function _get<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params)
  const res = await fetch(`${BASE}${path}?${qs}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? res.statusText)
  }
  return res.json()
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
    const res = await fetch(`${BASE}/api/health`)
    return res.ok
  } catch {
    return false
  }
}
