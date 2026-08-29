// @vitest-environment jsdom
//
// ⚠️ The DOM is opted into per file rather than globally. The specs that came
// before this one (datetime, client) are pure functions and a mocked `fetch`,
// and they keep running under `node` — installing jsdom did not change what
// they run against.

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import { useApiQuery } from "@/hooks/useApiQuery"
import { deferred } from "@/test/deferred"

afterEach(cleanup)

describe("useApiQuery", () => {
  it("starts loading, then holds the resolved value", async () => {
    const first = deferred<string>()
    const { result } = renderHook(() => useApiQuery(() => first.promise))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeNull()

    await act(async () => {
      first.resolve("shifts")
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBe("shifts")
    expect(result.current.error).toBeNull()
  })

  /**
   * ⚠️ The reason this hook exists rather than a `useEffect` in each page.
   * Three fast clicks on ◀ (step 11) put several requests in flight, and the
   * network may answer them in any order. Without the ignore flag the **first**
   * request's rows land last and sit under the **second** cycle's header — a
   * wrong answer that looks entirely right.
   */
  it("keeps the newest result when an older request resolves after it", async () => {
    const july = deferred<string>()
    const august = deferred<string>()

    const { result, rerender } = renderHook(
      ({ cycle }: { cycle: string }) =>
        useApiQuery(() => (cycle === "2026-07" ? july.promise : august.promise), [
          cycle,
        ]),
      { initialProps: { cycle: "2026-07" } },
    )

    // ◀ moves on before July has answered.
    rerender({ cycle: "2026-08" })

    await act(async () => {
      august.resolve("august rows")
    })
    expect(result.current.data).toBe("august rows")

    // July finally answers — and must be dropped on the floor.
    await act(async () => {
      july.resolve("july rows")
    })
    expect(result.current.data).toBe("august rows")
  })

  it("re-runs the fetcher on refetch, with no dependency change", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("before")
      .mockResolvedValueOnce("after")

    const { result } = renderHook(() => useApiQuery(fetcher))

    await act(async () => {})
    expect(result.current.data).toBe("before")
    expect(fetcher).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.refetch()
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBe("after")
  })

  it("surfaces an ApiError as its code", async () => {
    const { result } = renderHook(() =>
      useApiQuery(() => Promise.reject(new ApiError(400, "OPEN_SHIFT_EXISTS"))),
    )

    await act(async () => {})

    expect(result.current.error).toBe("OPEN_SHIFT_EXISTS")
    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it("degrades anything that is not an ApiError to UNKNOWN_ERROR", async () => {
    const { result } = renderHook(() =>
      useApiQuery(() => Promise.reject(new Error("boom"))),
    )

    await act(async () => {})

    expect(result.current.error).toBe("UNKNOWN_ERROR")
  })

  /** An error must never render over rows the user would read as current. */
  it("clears stale data when a refetch fails", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("rows")
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR"))

    const { result } = renderHook(() => useApiQuery(fetcher))

    await act(async () => {})
    expect(result.current.data).toBe("rows")

    await act(async () => {
      result.current.refetch()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe("NETWORK_ERROR")
  })
})
