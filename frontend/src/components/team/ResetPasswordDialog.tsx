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

interface ResetPasswordDialogProps {
  /** The employee awaiting confirmation, or null when the dialog is closed. */
  employee: UserResponse | null
  onCancel: () => void
  onConfirm: (employee: UserResponse) => Promise<void>
}

/**
 * Clearing a forgotten password is the most disruptive write on this page, and
 * the only one whose damage lands on someone who is not in the room: the
 * employee's password stops working the instant it succeeds, and every device
 * they are signed in on is dropped on its next request. `New code` beside it
 * looks similar and is not — that one touches an account nobody can sign into
 * anyway, which is why it fires straight from the row with no confirmation.
 *
 * ⚠️ **The structure is copied one for one from `DeactivateEmployeeDialog`**,
 * which copied it from `DeleteShiftDialog` — the project's confirmation shape
 * since step 11. A failed write keeps this dialog **open** with the reason
 * inside it· both buttons disable while it is in flight· and the page owns the
 * write. Step 13-2 rebuilt this pattern from scratch with the *opposite*
 * failure behaviour before noticing the original existed, and a confirmation
 * that closes on failure returns the user to a screen that looks unchanged —
 * which is the very question they opened it to ask.
 *
 * Unlike the other three, success here is not the end: the page closes this and
 * opens `SetupCodeDialog` with the new code, because the reset leaves a job
 * unfinished until that code reaches the employee.
 */
export function ResetPasswordDialog({
  employee,
  onCancel,
  onConfirm,
}: ResetPasswordDialogProps) {
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isResetting, setIsResetting] = useState(false)

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
    setIsResetting(true)
    try {
      await onConfirm(employee)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    } finally {
      setIsResetting(false)
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
          <AlertDialogTitle>{NOTICES.resetPasswordTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {employee === null
              ? null
              : NOTICES.resetPasswordBody(employee.name)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {failure !== null && (
          <p className="text-sm text-destructive" role="alert">
            {errorText(failure, "team")}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting}>
            {LABELS.cancel}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction that closes on click: a failed write has
              to keep the dialog open to show why. The page closes it on
              success instead — and then opens the code dialog. */}
          <AlertDialogAction
            disabled={isResetting}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {LABELS.resetPassword}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
