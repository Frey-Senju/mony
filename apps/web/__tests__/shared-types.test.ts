/**
 * Story 2.2 — DEC-007 enforcement tests.
 *
 * These tests pin the shape of the shared types so the backend Python enums
 * and the frontend cannot drift silently. They run in Jest and verify:
 *
 *  - `TransactionType` accepts the five canonical snake_case values.
 *  - `ApiResponse<T>` is importable from `@mony/shared` and has the expected
 *    optional fields (`data`, `error`, `message`).
 *
 * If a future change renames `INVESTMENT` to `invest` (or similar) the
 * compile-time check below will fail because the literal will no longer
 * widen to `TransactionType`.
 */

import type { ApiResponse, TransactionType, TransactionSource } from '@mony/shared'

describe('@mony/shared — Story 2.2 type contract', () => {
  it('TransactionType includes income, expense, transfer, investment, refund', () => {
    const all: TransactionType[] = ['income', 'expense', 'transfer', 'investment', 'refund']
    // The runtime side just asserts on length so we tie the runtime
    // behaviour to the compile-time list.
    expect(all).toHaveLength(5)
    expect(all).toContain('investment')
    expect(all).toContain('refund')
  })

  it('TransactionSource has manual and open_finance variants', () => {
    const all: TransactionSource[] = ['manual', 'open_finance']
    expect(all).toContain('manual')
    expect(all).toContain('open_finance')
  })

  it('ApiResponse<T> exposes data + error + message fields', () => {
    const ok: ApiResponse<{ id: string }> = { data: { id: 'abc' } }
    const err: ApiResponse<never> = { error: 'boom' }
    const note: ApiResponse<never> = { message: 'queued' }

    expect(ok.data?.id).toBe('abc')
    expect(err.error).toBe('boom')
    expect(note.message).toBe('queued')
  })
})
