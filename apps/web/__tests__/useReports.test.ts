/**
 * Unit tests for ``useReports`` hook (Story 1.6).
 *
 * Covers:
 *  U1: loading state transitions on fetch
 *  U2: summary + breakdown populated on success
 *  U3: error state on API failure
 *
 * Also tests pure helpers: ``shiftMonth`` December/January rollover and
 * the internal ``toNumber`` coercion for Decimal-backed JSON.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import {
  shiftMonth,
  useReports,
  __INTERNAL__,
} from '@/hooks/useReports'

// ---- fetch mock ---------------------------------------------------------

const originalFetch = global.fetch

beforeEach(() => {
  // Provide a baseline tokens entry so getAuthHeaders returns non-empty.
  ;(window.localStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === 'mony_tokens'
      ? JSON.stringify({ access_token: 'fake-jwt', refresh_token: 'r' })
      : null
  )
})

afterEach(() => {
  global.fetch = originalFetch
  jest.clearAllMocks()
})

function mockFetchOk(summary: any, breakdown: any) {
  global.fetch = jest.fn(async (url: any) => {
    const urlStr = String(url)
    const body = urlStr.includes('monthly-summary') ? summary : breakdown
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    } as any
  }) as any
}

// ---- pure helper tests --------------------------------------------------

describe('shiftMonth', () => {
  test('advances within same year', () => {
    expect(shiftMonth(2026, 4, 1)).toEqual({ year: 2026, month: 5 })
  })

  test('rolls from December to next January', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
  })

  test('rolls from January to previous December', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })

  test('large negative shift still valid', () => {
    expect(shiftMonth(2026, 3, -14)).toEqual({ year: 2025, month: 1 })
  })
})

describe('toNumber', () => {
  test('coerces Decimal-backed string to number', () => {
    expect(__INTERNAL__.toNumber('1234.56')).toBe(1234.56)
  })

  test('returns 0 for garbage', () => {
    expect(__INTERNAL__.toNumber(undefined as any)).toBe(0)
    expect(__INTERNAL__.toNumber('not-a-number')).toBe(0)
  })

  test('passes through numbers untouched', () => {
    expect(__INTERNAL__.toNumber(42)).toBe(42)
  })
})

// ---- hook tests ---------------------------------------------------------

describe('useReports — U1: loading state', () => {
  test('sets loading=true during fetch, loading=false after resolve', async () => {
    mockFetchOk(
      { year: 2026, month: 4, total_income: '500', total_expenses: '200', net_balance: '300' },
      {
        year: 2026,
        month: 4,
        total_expenses: '200',
        items: [
          {
            category_id: 'a',
            category_name: 'Food',
            total: '200',
            percentage: 100.0,
          },
        ],
      }
    )

    const { result } = renderHook(() => useReports('fake-jwt'))

    expect(result.current.loading).toBe(false) // starts idle
    expect(result.current.summary).toBeNull()

    await act(async () => {
      await result.current.fetchReports(2026, 4)
    })

    expect(result.current.loading).toBe(false) // resolved
    expect(result.current.summary).not.toBeNull()
  })
})

describe('useReports — U2: success', () => {
  test('populates summary and breakdown on successful Promise.all', async () => {
    mockFetchOk(
      {
        year: 2026,
        month: 4,
        total_income: '5000.00',
        total_expenses: '3200.00',
        net_balance: '1800.00',
      },
      {
        year: 2026,
        month: 4,
        total_expenses: '3200.00',
        items: [
          {
            category_id: 'cat-1',
            category_name: 'Food',
            total: '800.00',
            percentage: 25.0,
          },
          {
            category_id: 'cat-2',
            category_name: 'Transport',
            total: '2400.00',
            percentage: 75.0,
          },
        ],
      }
    )

    const { result } = renderHook(() => useReports('fake-jwt'))

    await act(async () => {
      await result.current.fetchReports(2026, 4)
    })

    await waitFor(() => expect(result.current.summary).not.toBeNull())

    expect(result.current.summary).toEqual({
      year: 2026,
      month: 4,
      total_income: 5000,
      total_expenses: 3200,
      net_balance: 1800,
    })
    expect(result.current.breakdown?.items).toHaveLength(2)
    expect(result.current.breakdown?.items[0].percentage).toBe(25)
    expect(result.current.error).toBeNull()

    // Verify Promise.all dispatched BOTH requests (parallel, not sequential).
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('monthly-summary'))).toBe(true)
    expect(urls.some((u) => u.includes('category-breakdown'))).toBe(true)
  })
})

describe('useReports — U3: error', () => {
  test('sets error and clears data when backend returns non-OK', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    })) as any

    const { result } = renderHook(() => useReports('fake-jwt'))

    await act(async () => {
      await result.current.fetchReports(2026, 4)
    })

    expect(result.current.summary).toBeNull()
    expect(result.current.breakdown).toBeNull()
    expect(result.current.error).toMatch(/Failed to fetch/i)
    expect(result.current.loading).toBe(false)
  })

  test('no-token scenario is a no-op (no fetch call, no error)', async () => {
    ;(window.localStorage.getItem as jest.Mock).mockReturnValue(null)
    global.fetch = jest.fn() as any

    const { result } = renderHook(() => useReports(undefined))

    await act(async () => {
      await result.current.fetchReports(2026, 4)
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
    expect(result.current.summary).toBeNull()
  })
})
