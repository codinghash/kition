import { expect, test, type Page, type Route } from '@playwright/test'

import { mockLocalWorkspaceApi } from './helpers/mockApi'

const ACCOUNT_SESSION_KEY = 'kition.portal.account.session.v1'
const ACCESS_TOKEN = 'referral-e2e-session-token'
const INVITE_URL = 'https://kition.ai/invite/REFERRAL_E2E'

type ReferralResponseMode = 'success' | 'failure'

async function installReferralDesktopBridge(page: Page) {
  await page.addInitScript(({ accountSessionKey, accessToken }) => {
    const stateWindow = window as typeof window & Record<string, unknown>
    const vaultPath = '/tmp/kition-referral-e2e-vault'
    const vault = {
      path: vaultPath,
      name: 'Referral E2E Vault',
      added_at: '2026-09-02T00:00:00.000Z',
      last_opened_at: '2026-09-02T00:00:00.000Z',
    }
    const accountSession = JSON.stringify({
      access_token: accessToken,
      token_prefix: 'referral',
      user_id: 41,
      user_email: 'inviter-e2e@example.com',
      expires_at: Date.now() + 60 * 60 * 1000,
      credit_total: 30_000,
      credit_balance: 30_000,
      credit_spent: 0,
      wallet_credit_total: 30_000,
      wallet_credit_balance: 30_000,
      wallet_credit_spent: 0,
      plan_code: 'free',
      plan_type: 'free',
      subscription_status: 'none',
      credit_reset_cycle: 'none',
    })
    const secureValues = new Map<string, string>([[accountSessionKey, accountSession]])
    window.localStorage.setItem('kition.e2e.apiBaseUrl', '/api')
    const registry = () => ({ vaults: [vault], active_vault_path: vaultPath })
    const listResponse = () => ({ root_path: vaultPath, items: [] })

    stateWindow.kitionDesktop = {
      shell: 'electron',
      DesktopInfo: async () => ({
        is_desktop: true,
        platform: 'darwin',
        backend_base_url: 'http://127.0.0.1:18101/api',
        workspace_dir: vaultPath,
        supports_secure_storage: true,
      }),
      BackendStatus: async () => ({
        base_url: 'http://127.0.0.1:18101',
        health_url: 'http://127.0.0.1:18101/health',
        running: true,
        last_error: '',
        logs: '',
        launch_mode: 'skip_api',
        capabilities: ['portal_referral'],
      }),
      StoreSecureValue: async (key: string, value: string) => secureValues.set(key, value),
      ReadSecureValue: async (key: string) => secureValues.get(key) || '',
      DeleteSecureValue: async (key: string) => secureValues.delete(key),
      OpenExternalURL: async () => {},
      ListVaults: async () => registry(),
      AddVault: async () => ({ vault, registry: registry() }),
      RemoveVault: async () => registry(),
      RenameVault: async () => ({ vault, registry: registry() }),
      SetActiveVault: async () => ({ list: listResponse(), registry: registry() }),
      ListWorkspaceDocuments: async () => listResponse(),
      ReadWorkspaceDocument: async () => { throw new Error('not used') },
      WriteWorkspaceDocument: async () => { throw new Error('not used') },
    }

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          stateWindow.__referralCopiedText = value
        },
      },
    })
  }, { accountSessionKey: ACCOUNT_SESSION_KEY, accessToken: ACCESS_TOKEN })
}

async function fulfillRuntime(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(status === 200
      ? { code: 200, message: 'success', data }
      : { code: status, message: 'referral unavailable', data: null }),
  })
}

async function installReferralRuntime(page: Page, mode: () => ReferralResponseMode) {
  await mockLocalWorkspaceApi(page)

  await page.route('**/api/v1/desktop/portal/session/status', async (route) => {
    const requestBody = route.request().postDataJSON() as { access_token?: string }
    expect(requestBody.access_token).toBe(ACCESS_TOKEN)
    await fulfillRuntime(route, {
      authenticated: true,
      token_prefix: 'referral',
      user_id: 41,
      user_email: 'inviter-e2e@example.com',
      expires_at: Date.now() + 60 * 60 * 1000,
      credit_total: 30_000,
      credit_balance: 30_000,
      credit_spent: 0,
      wallet_credit_total: 30_000,
      wallet_credit_balance: 30_000,
      wallet_credit_spent: 0,
      plan_code: 'free',
      plan_type: 'free',
      subscription_status: 'none',
      credit_reset_cycle: 'none',
    })
  })

  await page.route('**/api/v1/desktop/portal/referral', async (route) => {
    if (mode() === 'failure') {
      await fulfillRuntime(route, null, 502)
      return
    }
    await fulfillRuntime(route, {
      invite_code: 'REFERRAL_E2E',
      invite_url: INVITE_URL,
      reward_per_invite: 10_000,
      referral_count: 3,
      rewarded_referral_count: 2,
      rewarded_credits: 20_000,
      invite_limit: 5,
      invite_remaining: 2,
    })
  })
}

test.describe('referral sharing', () => {
  test.beforeEach(async ({ page }) => {
    await installReferralDesktopBridge(page)
  })

  test('restores the account, shows the authoritative invite summary, and copies the server URL', async ({ page }) => {
    await installReferralRuntime(page, () => 'success')
    await page.goto('/settings?section=account')

    const card = page.getByTestId('kition-referral-card')
    await expect(card).toBeVisible()
    await expect(page.getByTestId('kition-referral-url')).toHaveValue(INVITE_URL)
    await expect(card).toContainText('You earn 10,000 credits for each rewarded invite')
    await expect(card).toContainText('2 of 5 invites remaining')
    await expect(card).toContainText('20,000')

    await page.getByTestId('kition-referral-copy').click()
    await expect(card.getByRole('status')).toContainText('Invite link copied')
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __referralCopiedText?: string }).__referralCopiedText)).toBe(INVITE_URL)
  })

  test('shows a recoverable runtime error and succeeds after retry', async ({ page }) => {
    let responseMode: ReferralResponseMode = 'failure'
    await installReferralRuntime(page, () => responseMode)
    await page.goto('/settings?section=account')

    const card = page.getByTestId('kition-referral-card')
    await expect(card.getByRole('alert')).toContainText('Invite details are temporarily unavailable')

    responseMode = 'success'
    await page.getByTestId('kition-referral-retry').click()
    await expect(page.getByTestId('kition-referral-url')).toHaveValue(INVITE_URL)
    await expect(card.getByRole('alert')).toHaveCount(0)
  })
})
