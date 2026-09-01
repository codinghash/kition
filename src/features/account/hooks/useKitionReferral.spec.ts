import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortalAccountSession, PortalReferralSummary } from '@/api/desktop'

const getPortalReferralSummary = vi.hoisted(() => vi.fn())

vi.mock('@/services/portalAccount', () => ({ getPortalReferralSummary }))

import { useKitionReferral } from './useKitionReferral'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const sessionA: PortalAccountSession = {
  access_token: 'session-token-a',
  token_prefix: 'session-a',
  user_id: 7,
  user_email: 'member-a@kition.ai',
  expires_at: 1_785_542_400_000,
}

const sessionB: PortalAccountSession = {
  ...sessionA,
  access_token: 'session-token-b',
  token_prefix: 'session-b',
  user_id: 8,
  user_email: 'member-b@kition.ai',
}

function referralSummary(overrides: Partial<PortalReferralSummary> = {}): PortalReferralSummary {
  return {
    invite_code: 'INVITE123',
    invite_url: 'https://kition.ai/signup?invite=INVITE123',
    reward_per_invite: 10_000,
    referral_count: 4,
    rewarded_referral_count: 3,
    rewarded_credits: 30_000,
    invite_limit: 5,
    invite_remaining: 1,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

let container: HTMLDivElement
let root: Root | null = null

async function renderReferralHook(initialSession: PortalAccountSession | null) {
  const ref: { current: ReturnType<typeof useKitionReferral> | null } = { current: null }

  function Harness({ session }: { session: PortalAccountSession | null }) {
    ref.current = useKitionReferral(session)
    return null
  }

  async function render(session: PortalAccountSession | null) {
    await act(async () => {
      root ||= createRoot(container)
      root.render(createElement(Harness, { session }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  await render(initialSession)
  return { ref, render }
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  getPortalReferralSummary.mockReset()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container.remove()
})

describe('useKitionReferral', () => {
  it('stays idle and does not fetch without an authenticated session', async () => {
    const { ref } = await renderReferralHook(null)

    expect(ref.current?.state).toEqual({
      status: 'idle',
      summary: null,
      errorMessage: '',
    })
    expect(getPortalReferralSummary).not.toHaveBeenCalled()
  })

  it('loads the server-provided referral summary on demand', async () => {
    const pending = deferred<PortalReferralSummary>()
    getPortalReferralSummary.mockReturnValue(pending.promise)

    const { ref } = await renderReferralHook(sessionA)
    expect(ref.current?.state.status).toBe('loading')

    const summary = referralSummary()
    await act(async () => {
      pending.resolve(summary)
      await pending.promise
    })

    expect(ref.current?.state).toEqual({
      status: 'success',
      summary,
      errorMessage: '',
    })
  })

  it('shows a retryable error and recovers without retaining the failure', async () => {
    getPortalReferralSummary
      .mockRejectedValueOnce(new Error('Referral service unavailable'))
      .mockResolvedValueOnce(referralSummary())

    const { ref } = await renderReferralHook(sessionA)
    expect(ref.current?.state).toEqual({
      status: 'error',
      summary: null,
      errorMessage: 'Referral service unavailable',
    })

    await act(async () => {
      await ref.current?.retry()
    })

    expect(getPortalReferralSummary).toHaveBeenCalledTimes(2)
    expect(ref.current?.state.status).toBe('success')
    expect(ref.current?.state.errorMessage).toBe('')
  })

  it('deduplicates concurrent requests for the same authenticated session', async () => {
    const pending = deferred<PortalReferralSummary>()
    getPortalReferralSummary.mockReturnValue(pending.promise)
    const { ref } = await renderReferralHook(sessionA)

    let retryOne: Promise<PortalReferralSummary | null> | undefined
    let retryTwo: Promise<PortalReferralSummary | null> | undefined
    await act(async () => {
      retryOne = ref.current?.retry()
      retryTwo = ref.current?.retry()
      await Promise.resolve()
    })

    expect(getPortalReferralSummary).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve(referralSummary())
      await Promise.all([retryOne, retryTwo])
    })
    expect(ref.current?.state.status).toBe('success')
  })

  it('deduplicates one request across two hook consumers for the same session', async () => {
    const pending = deferred<PortalReferralSummary>()
    getPortalReferralSummary.mockReturnValue(pending.promise)
    const firstRef: { current: ReturnType<typeof useKitionReferral> | null } = { current: null }
    const secondRef: { current: ReturnType<typeof useKitionReferral> | null } = { current: null }

    function FirstConsumer() {
      firstRef.current = useKitionReferral(sessionA)
      return null
    }

    function SecondConsumer() {
      secondRef.current = useKitionReferral(sessionA)
      return null
    }

    await act(async () => {
      root = createRoot(container)
      root.render(createElement('div', null, createElement(FirstConsumer), createElement(SecondConsumer)))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getPortalReferralSummary).toHaveBeenCalledTimes(1)
    expect(firstRef.current?.state.status).toBe('loading')
    expect(secondRef.current?.state.status).toBe('loading')

    const result = referralSummary()
    await act(async () => {
      pending.resolve(result)
      await pending.promise
    })

    expect(firstRef.current?.state.summary).toEqual(result)
    expect(secondRef.current?.state.summary).toEqual(result)
  })

  it('ignores an old session response after the authenticated identity changes', async () => {
    const first = deferred<PortalReferralSummary>()
    const second = deferred<PortalReferralSummary>()
    getPortalReferralSummary
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const { ref, render } = await renderReferralHook(sessionA)
    await render(sessionB)

    await act(async () => {
      first.resolve(referralSummary({ invite_url: 'https://kition.ai/signup?invite=STALE123' }))
      await first.promise
    })
    expect(ref.current?.state.status).toBe('loading')
    expect(ref.current?.state.summary).toBeNull()

    const current = referralSummary({ invite_url: 'https://kition.ai/signup?invite=CURRENT1' })
    await act(async () => {
      second.resolve(current)
      await second.promise
    })
    expect(ref.current?.state.summary).toEqual(current)
  })

  it('clears referral data on logout and ignores a response that finishes afterward', async () => {
    const pending = deferred<PortalReferralSummary>()
    getPortalReferralSummary.mockReturnValue(pending.promise)
    const { ref, render } = await renderReferralHook(sessionA)

    await render(null)
    expect(ref.current?.state).toEqual({
      status: 'idle',
      summary: null,
      errorMessage: '',
    })

    await act(async () => {
      pending.resolve(referralSummary())
      await pending.promise
    })
    expect(ref.current?.state.status).toBe('idle')
    expect(ref.current?.state.summary).toBeNull()
  })
})
