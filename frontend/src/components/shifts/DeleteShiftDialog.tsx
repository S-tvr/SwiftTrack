import { useState } from "react"

import { ApiError } from "@/api/client"
import type { CycleTimeEntry } from "@/api/timeEntries"
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
import { formatDateTime } from "@/lib/datetime"
import { errorText, LABELS, NOTICES, type ErrorCode } from "@/lib/messages"

interface DeleteShiftDialogProps {
  /** The row awaiting confirmation, or null when the dialog is closed. */
  entry: CycleTimeEntry | null
  onCancel: () => void
  onConfirm: (entry: CycleTimeEntry) => Promise<void>
}

/**
 * Deleting a shift is **permanent** — unlike deactivating an employee, which is
 * a soft delete with a `Reactivate` on the other side. There is no restore, so
 * the dialog names the shift being removed rather than asking "are you sure?"
 * about an unnamed row.
 */
export function DeleteShiftDialog({
  entry,
  onCancel,
  onConfirm,
}: DeleteShiftDialogProps) {
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  /**
   * Clears the failure on the way **out** rather than on the way in. An effect
   * watching `entry` would be `setState` inside an effect body — cascading
   * renders, and what `react-hooks/set-state-in-effect` forbids. Every dismissal
   * (Cancel, Escape, a click outside) arrives here, and a successful delete
   * cannot leave a failure behind to clear.
   */
  function cancel() {
    setFailure(null)
    onCancel()
  }

  async function confirm() {
    if (entry === null) return
    setFailure(null)
    setIsDeleting(true)
    try {
      await onConfirm(entry)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) cancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{NOTICES.deleteShiftTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {entry === null
              ? null
              : NOTICES.deleteShiftBody(formatDateTime(entry.startTime))}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {failure !== null && (
          <p className="text-sm text-destructive" role="alert">
            {errorText(failure, "shifts")}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {LABELS.cancel}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction that closes on click: a failed delete has
              to keep the dialog open to show why. The page closes it on
              success instead. */}
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {LABELS.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
