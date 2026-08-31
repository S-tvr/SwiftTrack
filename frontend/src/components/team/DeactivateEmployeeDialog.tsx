import { useState } from "react"

import { ApiError } from "@/api/client"
import type { UserResponse } from "@/api/users"
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
import { errorText, LABELS, NOTICES, type ErrorCode } from "@/lib/messages"

interface DeactivateEmployeeDialogProps {
  /** The employee awaiting confirmation, or null when the dialog is closed. */
  employee: UserResponse | null
  onCancel: () => void
  onConfirm: (employee: UserResponse) => Promise<void>
}

/**
 * Deactivating is a **soft** delete — the row survives, the shifts and payroll
 * history survive, and `Reactivate` is one click away on the same row. That is
 * the opposite of `DeleteShiftDialog`, whose subject really is gone forever, so
 * the two dialogs say different things.
 *
 * ⚠️ **The structure, however, is copied one for one from `DeleteShiftDialog`,
 * on purpose.** A failed write keeps this dialog **open** with the reason
 * inside it· both buttons disable while it is in flight· and the page owns the
 * write. Step 13-2's first draft rebuilt this pattern with the *opposite*
 * failure behaviour without knowing the original existed, and a confirmation
 * that closes on failure returns the user to a screen that looks unchanged —
 * which is the very question they opened it to ask.
 */
export function DeactivateEmployeeDialog({
  employee,
  onCancel,
  onConfirm,
}: DeactivateEmployeeDialogProps) {
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)

  /**
   * Clears the failure on the way **out** rather than on the way in. An effect
   * watching `employee` would be `setState` inside an effect body — cascading
   * renders, and what `react-hooks/set-state-in-effect` forbids. Every dismissal
   * arrives here, and a successful write cannot leave a failure behind.
   */
  function cancel() {
    setFailure(null)
    onCancel()
  }

  async function confirm() {
    if (employee === null) return
    setFailure(null)
    setIsDeactivating(true)
    try {
      await onConfirm(employee)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    } finally {
      setIsDeactivating(false)
    }
  }

  return (
    <AlertDialog
      open={employee !== null}
      onOpenChange={(open) => {
        if (!open) cancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{NOTICES.deactivateEmployeeTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {employee === null
              ? null
              : NOTICES.deactivateEmployeeBody(employee.name)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {failure !== null && (
          <p className="text-sm text-destructive" role="alert">
            {errorText(failure, "team")}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeactivating}>
            {LABELS.cancel}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction that closes on click: a failed write has
              to keep the dialog open to show why. The page closes it on
              success instead. */}
          <AlertDialogAction
            disabled={isDeactivating}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {LABELS.deactivate}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
