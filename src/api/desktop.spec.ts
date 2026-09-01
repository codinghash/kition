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

  it('loads the portal referral summary with GET and unwraps the desktop envelope', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: referralSummary })

    await expect(getPortalReferralSummary()).resolves.toEqual(referralSummary)
    expect(request.get).toHaveBeenCalledWith('/v1/desktop/portal/referral')
    expect(request.post).not.toHaveBeenCalled()
  })
})
