import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortalAccountSession, PortalReferralSummary } from '@/api/desktop'

const referralMock = vi.hoisted(() => ({ current: {} as any }))
const copyTextToClipboard = vi.hoisted(() => vi.fn())
const trackProductEvent = vi.hoisted(() => vi.fn())

vi.mock('@/features/account/hooks/useKitionReferral', () => ({
  useKitionReferral: () => referralMock.current,
}))

vi.mock('@/features/support/lib/supportDiagnostics', () => ({ copyTextToClipboard }))
vi.mock('@/features/analytics/lib/productAnalytics', () => ({ trackProductEvent }))

import { KitionReferralCard } from './KitionReferralCard'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const session: PortalAccountSession = {
  access_token: 'account-token',
  token_prefix: 'account',
  user_id: 7,
  user_email: 'member@kition.ai',
  expires_at: 1_785_542_400_000,
}

function summary(overrides: Partial<PortalReferralSummary> = {}): PortalReferralSummary {
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

function referralState(
  status: 'idle' | 'loading' | 'success' | 'error',
  referralSummary: PortalReferralSummary | null = null,
) {
  return {
    state: {
      status,
      summary: referralSummary,
      errorMessage: status === 'error' ? 'Referral service unavailable' : '',
    },
    retry: vi.fn().mockResolvedValue(referralSummary),
  }
}

let container: HTMLDivElement
let root: Root | null = null

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => {
    root = createRoot(container)
    root.render(createElement(KitionReferralCard, { session }))
    await Promise.resolve()
  })
}

beforeEach(() => {
  referralMock.current = referralState('success', summary())
  copyTextToClipboard.mockReset().mockResolvedValue(undefined)
  trackProductEvent.mockReset()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
})

describe('KitionReferralCard', () => {
  it('shows an accessible loading state while invite details are fetched', async () => {
    referralMock.current = referralState('loading')
    await mount()

    const card = container.querySelector('[data-testid="kition-referral-card"]')
    expect(card?.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector('h2')?.textContent).toContain('Invite friends')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Loading invite details')
    expect(container.querySelector('[data-testid="kition-referral-loading"]')).not.toBeNull()
  })

  it('shows a retry action when referral details are unavailable', async () => {
    referralMock.current = referralState('error')
    await mount()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Invite details are temporarily unavailable')
    await act(async () => {
      const retry = container.querySelector('[data-testid="kition-referral-retry"]') as HTMLButtonElement
      retry.click()
      await Promise.resolve()
    })
    expect(referralMock.current.retry).toHaveBeenCalledTimes(1)
  })

  it('renders the server URL, inviter-only reward explanation, totals, and finite availability', async () => {
    await mount()

    expect(container.textContent).toContain('You earn 10,000 credits for each rewarded invite')
    expect(container.textContent).toContain('Referral credits are awarded to you, not the person you invite')
    expect(container.querySelector('[data-testid="kition-referral-url"]')?.textContent)
      .toBe('https://kition.ai/signup?invite=INVITE123')
    expect(container.textContent).toContain('Rewarded invites')
    expect(container.textContent).toContain('3')
    expect(container.textContent).toContain('Credits earned')
    expect(container.textContent).toContain('30,000')
    expect(container.textContent).toContain('1 of 5 invites remaining')
    expect(trackProductEvent).toHaveBeenCalledWith('referral_invite_viewed')
  })

  it('presents the zero-limit sentinel as unlimited', async () => {
    referralMock.current = referralState('success', summary({ invite_limit: 0, invite_remaining: 0 }))
    await mount()

    expect(container.textContent).toContain('Unlimited invites')
    expect(container.textContent).not.toContain('0 of 0 invites remaining')
  })

  it('copies only the server-provided URL and announces success without analytics content', async () => {
    await mount()

    await act(async () => {
      const copy = container.querySelector('[data-testid="kition-referral-copy"]') as HTMLButtonElement
      copy.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(copyTextToClipboard).toHaveBeenCalledWith('https://kition.ai/signup?invite=INVITE123')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Invite link copied')
    expect(trackProductEvent).toHaveBeenCalledWith('referral_invite_copy_completed', { result: 'success' })
    expect(JSON.stringify(trackProductEvent.mock.calls)).not.toContain('INVITE123')
    expect(JSON.stringify(trackProductEvent.mock.calls)).not.toContain('https://')
  })

  it('announces clipboard failure and records only a coarse failure result', async () => {
    copyTextToClipboard.mockRejectedValueOnce(new Error('clipboard contains private details'))
    await mount()

    await act(async () => {
      const copy = container.querySelector('[data-testid="kition-referral-copy"]') as HTMLButtonElement
      copy.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('Could not copy the invite link')
    expect(trackProductEvent).toHaveBeenCalledWith('referral_invite_copy_completed', { result: 'failure' })
    expect(JSON.stringify(trackProductEvent.mock.calls)).not.toContain('clipboard contains private details')
  })
})
