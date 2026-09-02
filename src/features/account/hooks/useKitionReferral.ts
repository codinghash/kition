import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortalAccountSession, PortalReferralSummary } from '@/api/desktop'
import { getPortalReferralSummary } from '@/services/portalAccount'

export type KitionReferralStatus = 'idle' | 'loading' | 'success' | 'error'

export type KitionReferralState = {
  status: KitionReferralStatus
  summary: PortalReferralSummary | null
  errorMessage: string
}

const idleState: KitionReferralState = {
  status: 'idle',
  summary: null,
  errorMessage: '',
}

const loadingState: KitionReferralState = {
  status: 'loading',
  summary: null,
  errorMessage: '',
}

type KitionReferralSnapshot = {
  sessionIdentity: string
  state: KitionReferralState
}

const referralRequests = new Map<string, Promise<PortalReferralSummary>>()

export function kitionReferralSessionIdentity(session: PortalAccountSession | null) {
  if (!session) return ''
  return `${session.user_id}:${session.token_prefix}:${session.expires_at}`
}

function requestReferralSummary(sessionIdentity: string) {
  const existing = referralRequests.get(sessionIdentity)
  if (existing) return existing

  const pending = getPortalReferralSummary().finally(() => {
    if (referralRequests.get(sessionIdentity) === pending) {
      referralRequests.delete(sessionIdentity)
    }
  })
  referralRequests.set(sessionIdentity, pending)
  return pending
}

export function useKitionReferral(session: PortalAccountSession | null) {
  const sessionIdentity = kitionReferralSessionIdentity(session)
  const sessionIdentityRef = useRef(sessionIdentity)
  const requestVersionRef = useRef(0)
  const [snapshot, setSnapshot] = useState<KitionReferralSnapshot>({
    sessionIdentity: '',
    state: idleState,
  })

  const load = useCallback(async (targetIdentity: string) => {
    if (!targetIdentity) {
      setSnapshot({ sessionIdentity: '', state: idleState })
      return null
    }

    const requestVersion = ++requestVersionRef.current
    setSnapshot({ sessionIdentity: targetIdentity, state: loadingState })

    try {
      const summary = await requestReferralSummary(targetIdentity)
      if (
        requestVersion === requestVersionRef.current
        && targetIdentity === sessionIdentityRef.current
      ) {
        setSnapshot({
          sessionIdentity: targetIdentity,
          state: { status: 'success', summary, errorMessage: '' },
        })
      }
      return summary
    } catch (error) {
      if (
        requestVersion === requestVersionRef.current
        && targetIdentity === sessionIdentityRef.current
      ) {
        setSnapshot({
          sessionIdentity: targetIdentity,
          state: {
            status: 'error',
            summary: null,
            errorMessage: error instanceof Error && error.message
              ? error.message
              : 'Kition invite details could not be loaded.',
          },
        })
      }
      return null
    }
  }, [])

  useEffect(() => {
    sessionIdentityRef.current = sessionIdentity
    requestVersionRef.current += 1

    if (!sessionIdentity) {
      setSnapshot({ sessionIdentity: '', state: idleState })
      return
    }

    void load(sessionIdentity)

    return () => {
      requestVersionRef.current += 1
    }
  }, [load, sessionIdentity])

  const retry = useCallback(() => load(sessionIdentityRef.current), [load])
  const state = snapshot.sessionIdentity === sessionIdentity
    ? snapshot.state
    : sessionIdentity
      ? loadingState
      : idleState

  return { state, retry }
}
