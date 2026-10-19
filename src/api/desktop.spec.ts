import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import { getPortalReferralSummary } from './desktop'

vi.mock('./request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const referralSummary = {
  invite_code: 'KITION100',
  invite_url: 'https://kition.ai/signup?ref=KITION100',
  reward_per_invite: 10_000,
  referral_count: 7,
  rewarded_referral_count: 5,
  rewarded_credits: 50_000,
  invite_limit: 20,
  invite_remaining: 13,
}

describe('desktop API', () => {
  beforeEach(() => {
    vi.mocked(request.get).mockReset()
    vi.mocked(request.post).mockReset()
  })

  it('loads the once-unwrapped portal referral summary with GET', async () => {
    vi.mocked(request.get).mockResolvedValue(referralSummary)

    await expect(getPortalReferralSummary()).resolves.toEqual(referralSummary)
    expect(request.get).toHaveBeenCalledWith('/v1/desktop/portal/referral')
    expect(request.post).not.toHaveBeenCalled()
  })

  it('does not unwrap a reserved data field inside the wire summary', async () => {
    const summaryWithReservedData = {
      ...referralSummary,
      data: {
        ...referralSummary,
        invite_code: 'NESTED100',
      },
    }
    vi.mocked(request.get).mockResolvedValue(summaryWithReservedData)

    await expect(getPortalReferralSummary()).resolves.toEqual(summaryWithReservedData)
  })

  it('publishes a credential-free HTTPS invite URL contract', () => {
    const schema = JSON.parse(
      readFileSync(resolve('contracts/account/referral-summary.schema.json'), 'utf8'),
    )
    const inviteURL = schema.properties.invite_url
    const pattern = new RegExp(inviteURL.pattern)

    expect(inviteURL.format).toBe('uri')
    expect(pattern.test('https://kition.ai/signup?ref=KITION100')).toBe(true)
    expect(pattern.test('https://user:password@kition.ai/signup?ref=KITION100')).toBe(false)
  })
})
