import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Runs a callback when a deep-link query param appears (e.g. ?new=1), then removes it from the URL. */
export function useParamOnce(key: string, run: (value: string) => void) {
  const [params, setParams] = useSearchParams()
  const value = params.get(key)
  const runRef = useRef(run)
  runRef.current = run
  useEffect(() => {
    if (value === null) return
    runRef.current(value)
    setParams(
      (p) => {
        p.delete(key)
        return p
      },
      { replace: true },
    )
  }, [key, value, setParams])
}
