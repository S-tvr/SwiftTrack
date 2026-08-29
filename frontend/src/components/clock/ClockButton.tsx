import { useState } from "react"
import { Clock } from "lucide-react"

import { ApiError } from "@/api/client"
import { clockIn, clockOut, getOpenShift } from "@/api/timeEntries"
import { Button } from "@/components/ui/button"
import { useApiQuery } from "@/hooks/useApiQuery"
import { formatDateTime } from "@/lib/datetime"
import { errorText, LABELS, NOTICES, type ErrorCode } from "@/lib/messages"

/**
 * The Clock page, effectively — the page around it is a title and this.
 *
 * ⚠️ Nothing here sends a time. The server writes `startTime = now` and
 * `endTime = now` itself, which is what makes clock in/out immune to a wrong
 * device clock or a foreign timezone. `lib/datetime.ts` is used for display and
 * for nothing else.
 */
export function ClockButton() {
  const { data, error, isLoading, refetch } = useApiQuery(getOpenShift)

  /** The last write's failure, keyed by code. Distinct from `error` above,
   *  which is the *load* failing — that one hides the button entirely. */
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isWriting, setIsWriting] = useState(false)

  // ⚠️ `data.openShift`, never `data`. The response is wrapped precisely
  // because Nest answers a bare `null` with an empty body.
  const openShift = data?.openShift ?? null

  // Held down through the refetch as well as the write. Releasing it when the
  // write resolves would leave a window where the button is pressable and its
  // label is still the old one.
  const isBusy = isWriting || isLoading

  async function handleClick() {
    setFailure(null)
    setIsWriting(true)
    try {
      await (openShift === null ? clockIn() : clockOut())
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    } finally {
      // ⚠️ After **every** attempt, not only the successful ones — one rule
      // rather than a list of codes to keep in step with the backend.
      // OPEN_SHIFT_EXISTS and NO_OPEN_SHIFT both mean the label was stale (a
      // second tab, a clock-in from a phone), and without this the user presses
      // the same wrong button forever. After a timeout it is the only way to
      // learn whether the write landed at all.
      refetch()
      setIsWriting(false)
    }
  }

  function handleRetry() {
    // A fresh start: keeping the previous write's message would let it reappear
    // under a button that has since been reloaded from the server.
    setFailure(null)
    refetch()
  }

  // ⚠️ The load failed, so the state is unknown — and a button must print a
  // label. Offering "Clock In" to someone already clocked in is the exact
  // failure GET /time-entries/open exists to prevent, so the button is withheld
  // rather than disabled.
  if (error !== null) {
    return (
      <div className="flex flex-col items-center gap-3">
        {/* The screen key is passed even though no `clock` override exists
            today — the convention this codebase already follows (LoginPage
            passes "login" against an equally empty entry) is that the page
            always declares its own, so adding an override later reaches every
            call site instead of whichever one was remembered. */}
        <p className="text-sm text-destructive" role="alert">
          {errorText(error, "clock")}
        </p>
        <Button variant="outline" onClick={handleRetry}>
          {LABELS.retry}
        </Button>
      </div>
    )
  }

  // First load. A placeholder of the button's own size, so the page does not
  // jump when the answer arrives.
  if (data === null) {
    return (
      <div className="w-full max-w-xs" role="status">
        {/* The shape below is decorative, so on its own it announces nothing.
            This is what a screen reader reads while the state is unknown. */}
        <span className="sr-only">{LABELS.loading}</span>
        <div
          className="h-16 w-full animate-pulse rounded-md bg-muted"
          aria-hidden="true"
        />
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <Button
        size="lg"
        variant={openShift === null ? "default" : "destructive"}
        className="h-16 w-full gap-2 text-base"
        onClick={() => void handleClick()}
        disabled={isBusy}
      >
        <Clock className="size-5" />
        {openShift === null ? LABELS.clockIn : LABELS.clockOut}
      </Button>

      {/* Shows the **date**, not just the time: a "Clock Out" label alone
          cannot distinguish being on shift from having forgotten to clock out
          two days ago. It is also the confirmation of a successful clock-in —
          it appears where there was nothing, and stays for the whole shift. */}
      {openShift !== null && (
        <p className="text-sm text-muted-foreground" role="status">
          {NOTICES.clockedInSince(formatDateTime(openShift.startTime))}
        </p>
      )}

      {/* Beside the button rather than somewhere that fades: "you already have
          an open shift" is an instruction the user has to act on. */}
      {failure !== null && (
        <p className="text-center text-sm text-destructive" role="alert">
          {errorText(failure, "clock")}
        </p>
      )}
    </div>
  )
}
