import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getLang } from '@/i18n'
import { defaultSettings, seedCollections, seedDomains } from '@/services/data/defaults'
import { closeUserData, openUserData, repo } from '@/services/data/store'
import { isFirebaseConfigured } from '@/services/firebase/config'
import { takeSignUpName, watchAuth } from '@/services/firebase/auth'
import { refreshCounts, startSync, stopSync } from '@/services/sync/engine'

export interface HubUser {
  uid: string
  email: string | null
  displayName: string | null
}

interface AuthState {
  status: 'loading' | 'signedOut' | 'ready' | 'error'
  user: HubUser | null
  /** True when no Firebase project is configured and all data stays on this device. */
  localMode: boolean
}

const Ctx = createContext<AuthState>({ status: 'loading', user: null, localMode: !isFirebaseConfigured })
export const useAuth = () => useContext(Ctx)

const LOCAL_USER: HubUser = { uid: 'local', email: null, displayName: null }

async function prepareUserData(user: HubUser) {
  await openUserData(user.uid)
  // Default domains and collections have stable ids, so a second device cannot duplicate them.
  const lang = getLang()
  await repo.seedLocal('lifeDomains', seedDomains(lang))
  await repo.seedLocal('bookmarkCollections', seedCollections(lang))
  const name = takeSignUpName()
  if (name) await repo.upsert('settings', 'app', { displayName: name }, defaultSettings())
  await refreshCounts()
  // Asks the browser not to evict local data. This matters for offline-first use on phones.
  void navigator.storage?.persist?.()
  startSync()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, localMode: !isFirebaseConfigured })

  useEffect(() => {
    if (!isFirebaseConfigured) {
      prepareUserData(LOCAL_USER)
        .then(() => setState({ status: 'ready', user: LOCAL_USER, localMode: true }))
        .catch(() => setState({ status: 'error', user: null, localMode: true }))
      return
    }
    let unsub: (() => void) | undefined
    let cancelled = false
    void watchAuth(async (fbUser) => {
      if (cancelled) return
      if (!fbUser) {
        stopSync()
        closeUserData()
        setState({ status: 'signedOut', user: null, localMode: false })
        return
      }
      const user: HubUser = { uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName }
      setState({ status: 'loading', user, localMode: false })
      try {
        await prepareUserData(user)
        setState({ status: 'ready', user, localMode: false })
      } catch {
        setState({ status: 'error', user, localMode: false })
      }
    }).then((u) => {
      unsub = u
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}
