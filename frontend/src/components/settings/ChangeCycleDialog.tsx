import { useState } from "react"

import { ApiError } from "@/api/client"
import { deriveCycleEndDay } from "@/api/settings"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatOrdinalDay } from "@/lib/format"
import { errorText, LABELS, NOTICES, type ErrorCode } from "@/lib/messages"

interface ChangeCycleDialogProps {
  /** The day awaiting confirmation, or null when the dialog is closed. */
  startDay: number | null
  onCancel: () => void
  onConfirm: (startDay: number) => Promise<void>
}

/**
 * Confirms a change to the pay-cycle boundary.
 *
 * ⚠️ **Deliberately the same shape as `DeleteShiftDialog`**, down to where the
 * failure renders and when the buttons go disabled — that component has been
 * the project's confirmation pattern since step 11, and a second one behaving
 * differently is worse than either behaviour on its own. The one thing this
 * dialog says that the other does not is *what changing the boundary does to
 * the past*: payroll is recomputed on every request and never frozen, so moving
 * this day re-cuts cycles that have already been paid.
 *
 * As there, `onConfirm` rejecting keeps the dialog **open** with the reason
 * inside it. A confirmation that closes on failure sends the user back to a
 * screen that looks unchanged, which is exactly what they were asking about.
 */
export function ChangeCycleDialog({
  startDay,
  onCancel,
  onConfirm,
}: ChangeCycleDialogProps) {
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  /** Cleared on the way out, never in an effect — the `DeleteShiftDialog` note
   *  applies verbatim (`react-hooks/set-state-in-effect`). */
  function cancel() {
    setFailure(null)
    onCancel()
  }

  async function confirm() {
    if (startDay === null) return
    setFailure(null)
    setIsSaving(true)
    try {
      await onConfirm(startDay)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AlertDialog
      open={startDay !== null}
      onOpenChange={(open) => {
        if (!open) cancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{NOTICES.changeCycleTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {startDay === null
              ? null
              : NOTICES.changeCycleBody(
                  formatOrdinalDay(startDay),
                  formatOrdinalDay(deriveCycleEndDay(startDay)),
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {failure !== null && (
          <p className="text-sm text-destructive" role="alert">
            {errorText(failure, "settings")}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>
            {LABELS.cancel}
          </AlertDialogCancel>
          {/* Not an action that closes on click: a failed write has to keep the
              dialog open to show why. The form closes it on success instead. */}
          <AlertDialogAction
            disabled={isSaving}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {LABELS.changeCycle}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
