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

interface ReactivateEmployeeDialogProps {
  /** The employee awaiting confirmation, or null when the dialog is closed. */
  employee: UserResponse | null
  onCancel: () => void
  onConfirm: (employee: UserResponse) => Promise<void>
}

/**
 * The mildest of the four confirmations, and the one whose *reason* is the
 * least obvious: reactivating restores sign-in with the **existing password**,
 * so nothing needs handing over afterwards.
 *
 * It confirms at all because every row action on this page does. An admin who
 * has learned that these buttons ask is entitled to the same pause on the one
 * that grants access back — and the alternative, a single action that fires
 * straight from a row while its neighbours all stop to ask, is the kind of
 * inconsistency that gets one of them clicked by accident.
 *
 * ⚠️ **The structure is copied one for one from `DeactivateEmployeeDialog`**,
 * which copied it from `DeleteShiftDialog` — the project's confirmation shape
 * since step 11. A failed write keeps this dialog **open** with the reason
 * inside it· both buttons disable while it is in flight· and the page owns the
 * write. A confirmation that closes on failure returns the user to a screen
 * that looks unchanged, which is the very question they opened it to ask.
 */
export function ReactivateEmployeeDialog({
  employee,
  onCancel,
  onConfirm,
}: ReactivateEmployeeDialogProps) {
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isReactivating, setIsReactivating] = useState(false)

  /**
   * Clears the failure on the way **out** rather than on the way in, as its
   * three siblings do: an effect watching `employee` would be `setState` inside
   * an effect body, which `react-hooks/set-state-in-effect` forbids. Every
   * dismissal arrives here, and a successful write cannot leave one behind.
   */
  function cancel() {
    setFailure(null)
    onCancel()
  }

  async function confirm() {
    if (employee === null) return
    setFailure(null)
    setIsReactivating(true)
    try {
      await onConfirm(employee)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    } finally {
      setIsReactivating(false)
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
          <AlertDialogTitle>
            {NOTICES.reactivateEmployeeTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {employee === null
              ? null
              : NOTICES.reactivateEmployeeBody(employee.name)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {failure !== null && (
          <p className="text-sm text-destructive" role="alert">
            {errorText(failure, "team")}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isReactivating}>
            {LABELS.cancel}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction that closes on click: a failed write has
              to keep the dialog open to show why. The page closes it on
              success instead. */}
          <AlertDialogAction
            disabled={isReactivating}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {LABELS.reactivate}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
