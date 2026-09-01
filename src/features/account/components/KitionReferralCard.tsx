import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Gift, LoaderCircle, RefreshCw } from 'lucide-react'

import type { PortalAccountSession } from '@/api/desktop'
import { Button } from '@/components/ui'
import { trackProductEvent } from '@/features/analytics/lib/productAnalytics'
import { useKitionReferral } from '@/features/account/hooks/useKitionReferral'
import { copyTextToClipboard } from '@/features/support/lib/supportDiagnostics'
import { useTranslation } from '@/i18n'

type CopyStatus = 'idle' | 'copying' | 'copied' | 'error'

export function KitionReferralCard({ session }: { session: PortalAccountSession }) {
  const { t, i18n } = useTranslation('settings')
  const { state, retry } = useKitionReferral(session)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const copyVersionRef = useRef(0)
  const sessionIdentityRef = useRef(session.access_token)
  if (sessionIdentityRef.current !== session.access_token) {
    sessionIdentityRef.current = session.access_token
    copyVersionRef.current += 1
  }
  const titleId = useId()
  const linkControlId = useId()
  const summary = state.summary
  const rewardPerInvite = summary?.reward_per_invite ?? 10_000
  const formatNumber = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage).format(value)

  useEffect(() => {
    const sessionIdentity = session.access_token
    sessionIdentityRef.current = sessionIdentity
    copyVersionRef.current += 1
    setCopyStatus('idle')
    trackProductEvent('referral_invite_viewed')

    return () => {
      copyVersionRef.current += 1
      if (sessionIdentityRef.current === sessionIdentity) {
        sessionIdentityRef.current = ''
      }
    }
  }, [session.access_token])

  async function copyInviteLink() {
    if (!summary || copyStatus === 'copying') return

    const targetIdentity = session.access_token
    const copyVersion = ++copyVersionRef.current
    setCopyStatus('copying')

    try {
      await copyTextToClipboard(summary.invite_url)
      if (
        copyVersion === copyVersionRef.current
        && targetIdentity === sessionIdentityRef.current
      ) {
        trackProductEvent('referral_invite_copy_completed', { result: 'success' })
        setCopyStatus('copied')
      }
    } catch {
      if (
        copyVersion === copyVersionRef.current
        && targetIdentity === sessionIdentityRef.current
      ) {
        trackProductEvent('referral_invite_copy_completed', { result: 'failure' })
        setCopyStatus('error')
      }
    }
  }

  const loading = state.status === 'loading' || state.status === 'idle'

  return (
    <section
      className="kition-referral-card"
      aria-labelledby={titleId}
      aria-busy={loading}
      data-testid="kition-referral-card"
    >
      <header className="kition-referral-card__header">
        <div className="kition-referral-card__icon" aria-hidden="true">
          <Gift className="size-4" />
        </div>
        <div className="min-w-0">
          <h2 id={titleId}>{t('account.referral.title')}</h2>
          <p>{t('account.referral.description', { credits: formatNumber(rewardPerInvite) })}</p>
        </div>
      </header>

      {loading ? (
        <div
          className="kition-referral-card__loading"
          role="status"
          aria-live="polite"
          data-testid="kition-referral-loading"
        >
          <span className="kition-referral-card__loading-label">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t('account.referral.loading')}
          </span>
          <span className="kition-referral-card__skeleton" aria-hidden="true" />
          <span className="kition-referral-card__skeleton is-short" aria-hidden="true" />
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className="kition-referral-card__unavailable" role="alert">
          <p>{t('account.referral.unavailable')}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void retry()}
            data-testid="kition-referral-retry"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t('account.referral.retry')}
          </Button>
        </div>
      ) : null}

      {state.status === 'success' && summary ? (
        <div className="kition-referral-card__content">
          <div className="kition-referral-card__link">
            <label htmlFor={linkControlId}>{t('account.referral.linkLabel')}</label>
            <textarea
              id={linkControlId}
              value={summary.invite_url}
              readOnly
              rows={2}
              wrap="soft"
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
              data-testid="kition-referral-url"
            />
          </div>

          <Button
            className="kition-referral-card__copy"
            onClick={() => void copyInviteLink()}
            disabled={copyStatus === 'copying'}
            aria-busy={copyStatus === 'copying'}
            data-testid="kition-referral-copy"
          >
            {copyStatus === 'copying' ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : copyStatus === 'copied' ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copyStatus === 'copying'
              ? t('account.referral.copying')
              : t('account.referral.copy')}
          </Button>

          {copyStatus === 'copied' ? (
            <p className="kition-referral-card__copy-feedback is-success" role="status" aria-live="polite">
              {t('account.referral.copied')}
            </p>
          ) : null}
          {copyStatus === 'error' ? (
            <p className="kition-referral-card__copy-feedback is-error" role="alert">
              {t('account.referral.copyFailed')}
            </p>
          ) : null}

          <dl className="kition-referral-card__metrics">
            <div>
              <dt>{t('account.referral.rewardedInvites')}</dt>
              <dd>{formatNumber(summary.rewarded_referral_count)}</dd>
            </div>
            <div>
              <dt>{t('account.referral.creditsEarned')}</dt>
              <dd>{formatNumber(summary.rewarded_credits)}</dd>
            </div>
            <div>
              <dt>{t('account.referral.availability')}</dt>
              <dd>
                {summary.invite_limit === 0
                  ? t('account.referral.unlimited')
                  : t('account.referral.remaining', {
                      remaining: formatNumber(summary.invite_remaining),
                      limit: formatNumber(summary.invite_limit),
                    })}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  )
}
