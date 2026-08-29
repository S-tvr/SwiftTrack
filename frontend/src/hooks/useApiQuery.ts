import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError } from "@/api/client"
import type { ErrorCode } from "@/lib/messages"

export interface ApiQueryResult<T> {
  data: T | null
  error: ErrorCode | null
  isLoading: boolean
  refetch: () => void
}

interface SettledResult<T> {
  /** Which request produced this — compared against the current key to decide
   *  whether we are still loading. */
  key: string
  data: T | null
  error: ErrorCode | null
}

/**
 * Every read goes through here. No page writes its own `useEffect` + `fetch`
 * (architecture.md § Frontend invariants).
 *
 * Writes deliberately do **not** use this hook — after a write the page calls
 * `refetch()` explicitly, so the sequence is visible at the call site instead
 * of hidden in a cache invalidation rule.
 *
 * ⚠️ `isLoading` is **derived**, not stored: a state setter called
 * synchronously in the effect body would trigger a second render pass on every
 * dependency change (the `react-hooks/set-state-in-effect` rule). Comparing the
 * settled result's key against the current one answers the same question for
 * free, and state is written exactly once per request — when it resolves.
 *
 * @param fetcher  Usually an inline arrow, so its identity changes on every
 *                 render. It is read through a ref and is **not** a trigger.
 * @param deps     What actually re-runs the query — e.g. `[cycle]`.
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
): ApiQueryResult<T> {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<SettledResult<T> | null>(null)

  // Serialising the deps into one string is what lets the effect declare a
  // single dependency instead of spreading a runtime array the lint rule cannot
  // see through. `attempt` is part of it so that refetch() re-runs the query
  // even when nothing else changed.
  const key = `${attempt}|${JSON.stringify(deps)}`

  const fetcherRef = useRef(fetcher)

  // Updated in an effect rather than during render, which would be a mutation
  // in a render pass. Declared first, so it has already run by the time the
  // query effect below fires in the same commit.
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    // ⚠️ The ignore flag is the point of this hook. Three fast clicks on ◀ can
    // resolve out of order and leave one cycle's rows on screen under another
    // cycle's totals. It is also what explains the doubled request React 19's
    // StrictMode makes in development.
    let ignore = false

    void (async () => {
      try {
        const result = await fetcherRef.current()
        if (!ignore) setSettled({ key, data: result, error: null })
      } catch (caught) {
        if (!ignore) {
          setSettled({
            key,
            // Cleared so an error is never rendered over stale rows the user
            // would read as current.
            data: null,
            error: caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR",
          })
        }
      }
    })()

    return () => {
      ignore = true
    }
  }, [key])

  const refetch = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    // While a new request is in flight the previous result stays on screen
    // rather than blanking — the response carries its own cycle block, so the
    // header and the rows can never disagree.
    data: settled?.data ?? null,
    error: settled?.error ?? null,
    isLoading: settled?.key !== key,
    refetch,
  }
}
