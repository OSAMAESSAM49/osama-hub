import { useSyncExternalStore } from 'react'

interface PwaState {
  updateReady: boolean
  offlineReady: boolean
  /** The deferred browser install prompt (Chromium only). */
  canInstall: boolean
}
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let state: PwaState = { updateReady: false, offlineReady: false, canInstall: false }
const listeners = new Set<() => void>()
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null
let installEvent: InstallPromptEvent | null = null

const set = (p: Partial<PwaState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}

export const usePwa = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallPromptEvent
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    set({ canInstall: false })
  })
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  void import('virtual:pwa-register').then(({ registerSW }) => {
    applyUpdate = registerSW({
      onNeedRefresh: () => set({ updateReady: true }),
      onOfflineReady: () => set({ offlineReady: true }),
    })
  })
}

export const installUpdate = () => applyUpdate?.(true)
export const dismissUpdate = () => set({ updateReady: false })

export async function promptInstall() {
  if (!installEvent) return
  await installEvent.prompt()
  await installEvent.userChoice
  installEvent = null
  set({ canInstall: false })
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
