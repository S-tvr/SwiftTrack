// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import {
  clockIn,
  clockOut,
  getOpenShift,
  type OpenShiftResponse,
  type TimeEntry,
} from "@/api/timeEntries"
import { ClockButton } from "@/components/clock/ClockButton"
import { deferred } from "@/test/deferred"

// Mocked at the api module rather than at `fetch`, deliberately: what this spec
// is about is the component's decisions, and client.spec.ts already proves the
// transport separately against a mocked `fetch`.
vi.mock("@/api/timeEntries", () => ({
  getOpenShift: vi.fn(),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
}))

const OPEN_SHIFT: TimeEntry = {
  id: 7,
  userId: 2,
  // ⚠️ Chosen so a display bug changes the **date**, not only the time: the
  // suite runs at TZ=America/St_Johns (-3:30), where this instant is 28 Aug
  // 21:30 locally. A formatter missing `timeZone: "UTC"` prints the 28th.
  startTime: "2026-08-29T01:00:00.000Z",
  endTime: null,
  notes: null,
}

/** Renders and lets the initial open-shift query settle. */
async function renderSettled() {
  render(<ClockButton />)
  await act(async () => {})
}

// `@testing-library/jest-dom` is deliberately not installed: these two read the
// DOM directly, which is all the assertions below need.
const clockControl = () => screen.getByRole<HTMLButtonElement>("button")
const buttonText = () => clockControl().textContent ?? ""

beforeEach(() => {
  vi.mocked(getOpenShift).mockReset()
  vi.mocked(clockIn).mockReset()
  vi.mocked(clockOut).mockReset()
})

afterEach(cleanup)

describe("ClockButton", () => {
  it("offers Clock In, and no open-shift line, when nothing is open", async () => {
    vi.mocked(getOpenShift).mockResolvedValue({ openShift: null })

    await renderSettled()

    expect(buttonText()).toContain("Clock In")
    expect(screen.queryByText(/Clocked in since/)).toBeNull()
  })

  it("offers Clock Out and prints the start instant in UTC", async () => {
    vi.mocked(getOpenShift).mockResolvedValue({ openShift: OPEN_SHIFT })

    await renderSettled()

    expect(buttonText()).toContain("Clock Out")
    expect(
      screen.getByText("Clocked in since 29 Aug 2026, 01:00."),
    ).toBeTruthy()
  })

  /** ⚠️ The whole point of GET /time-entries/open: with the state unknown, any
   *  label the button could print may be a lie. */
  it("renders no clock button at all while the state is unknown", async () => {
    const pending = deferred<{ openShift: TimeEntry | null }>()
    vi.mocked(getOpenShift).mockReturnValue(pending.promise)

    render(<ClockButton />)

    expect(screen.queryByRole("button")).toBeNull()

    await act(async () => {
      pending.resolve({ openShift: null })
    })
    expect(buttonText()).toContain("Clock In")
  })

  it("replaces the button with an error and a Retry when the load fails", async () => {
    vi.mocked(getOpenShift).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR"))

    await renderSettled()

    expect(screen.queryByText(/Clock In|Clock Out/)).toBeNull()
    expect(
      screen.getByText(
        "Could not reach the server. Check your connection and try again.",
      ),
    ).toBeTruthy()

    // Retry re-asks, and the button comes back.
    vi.mocked(getOpenShift).mockResolvedValue({ openShift: null })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    })

    expect(buttonText()).toContain("Clock In")
  })

  /**
   * ⚠️ The assertion that matters is the middle one, and it is the reason the
   * write and the reload are two separately-controlled promises. Releasing the
   * button when the **write** answers leaves a real window in which it is
   * pressable and still labelled "Clock In" for someone who is now clocked in —
   * a second press there is the double clock-in the backend has to refuse.
   */
  it("stays disabled between the write and the refetch behind it", async () => {
    vi.mocked(getOpenShift).mockResolvedValueOnce({ openShift: null })
    const write = deferred<TimeEntry>()
    vi.mocked(clockIn).mockReturnValue(write.promise)

    await renderSettled()
    expect(buttonText()).toContain("Clock In")

    // The reload the component fires after the write — held open on purpose.
    const reload = deferred<OpenShiftResponse>()
    vi.mocked(getOpenShift).mockReturnValueOnce(reload.promise)

    fireEvent.click(clockControl())
    await act(async () => {})

    expect(clockControl().disabled).toBe(true)
    expect(clockIn).toHaveBeenCalledTimes(1)

    // The write has answered; the state has not been re-read yet. The label is
    // still the old one, which is exactly why the button must stay locked.
    await act(async () => {
      write.resolve({ ...OPEN_SHIFT })
    })
    expect(clockControl().disabled).toBe(true)
    expect(buttonText()).toContain("Clock In")

    await act(async () => {
      reload.resolve({ openShift: OPEN_SHIFT })
    })
    expect(clockControl().disabled).toBe(false)
    expect(buttonText()).toContain("Clock Out")
    expect(screen.getByText("Clocked in since 29 Aug 2026, 01:00.")).toBeTruthy()
  })

  it("calls clock-out, not clock-in, while a shift is open", async () => {
    vi.mocked(getOpenShift).mockResolvedValueOnce({ openShift: OPEN_SHIFT })
    vi.mocked(clockOut).mockResolvedValue({
      ...OPEN_SHIFT,
      endTime: "2026-08-29T09:00:00.000Z",
    })

    await renderSettled()

    vi.mocked(getOpenShift).mockResolvedValue({ openShift: null })
    await act(async () => {
      fireEvent.click(screen.getByRole("button"))
    })

    expect(clockOut).toHaveBeenCalledTimes(1)
    expect(clockIn).not.toHaveBeenCalled()
    expect(buttonText()).toContain("Clock In")
    expect(screen.queryByText(/Clocked in since/)).toBeNull()
  })

  /**
   * ⚠️ A failed write refetches too. OPEN_SHIFT_EXISTS means exactly one thing —
   * our label was stale — and without re-asking, the user presses the same wrong
   * button forever.
   */
  it("shows the failure beside the button and still re-reads the state", async () => {
    vi.mocked(getOpenShift).mockResolvedValueOnce({ openShift: null })
    vi.mocked(clockIn).mockRejectedValue(new ApiError(400, "OPEN_SHIFT_EXISTS"))

    await renderSettled()
    expect(getOpenShift).toHaveBeenCalledTimes(1)

    // The truth the stale label missed: a shift is in fact already open.
    vi.mocked(getOpenShift).mockResolvedValue({ openShift: OPEN_SHIFT })
    await act(async () => {
      fireEvent.click(screen.getByRole("button"))
    })

    expect(
      screen.getByText("You already have an open shift. Please clock out first."),
    ).toBeTruthy()
    expect(getOpenShift).toHaveBeenCalledTimes(2)
    // The button corrected itself rather than staying wrong.
    expect(buttonText()).toContain("Clock Out")
  })
})
