import { useCallback, useMemo } from 'react'
import { defaultSettings } from '@/services/data/defaults'
import { repo, useCollection } from '@/services/data/store'
import type { AppSettings } from '@/types/models'

/** Settings is a singleton record. Until it is first changed, defaults apply and nothing is written. */
export function useSettings() {
  const { items, loading } = useCollection('settings')
  const stored = items.find((s) => s.id === 'app')
  const settings = useMemo<AppSettings>(() => ({ ...defaultSettings(), ...(stored ?? {}) }), [stored])
  const save = useCallback((patch: Partial<AppSettings>) => repo.upsert('settings', 'app', patch, defaultSettings()), [])
  return { settings, save, loading }
}
