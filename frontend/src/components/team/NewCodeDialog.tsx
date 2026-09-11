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

interface NewCodeDialogProps {
  /** The employee awaiting confirmation, or null when the dialog is closed. */
  employee: UserResponse | null
  onCancel: () => void
  onConfirm: (employee: UserResponse) => Promise<void>
}

/**
 * ⚠️ **The damage here is invisible and lands somewhere else: the previous code
 * stops working the instant this succeeds.** Nothing on screen says so, and
 * nothing fails locally. An admin who read the old four digits out over the
 * phone an hour ago has just invalidated them, and finds out only when the
 * employee calls back unable to activate.
 *
 * That is the whole reason this confirms, and it puts it beside
 * `ResetPasswordDialog` rather than apart from it: both replace a credential
 * somebody may already be holding. The difference is only that this one touches
 * an account nobody can sign into yet.
 *
 * ⚠️ **The structure is copied one for one from `DeactivateEmployeeDialog`**,
 * which copied it from `DeleteShiftDialog` — the project's confirmation shape
 * since step 11. A failed write keeps this dialog **open** with the reason
 * inside it· both buttons disable while it is in flight· and the page owns the
 * write.
 *
 * Like `ResetPasswordDialog`, success here is not the end: the page closes this
 * and opens `SetupCodeDialog` with the new code, because the re-issue leaves a
 * job unfinished until that code reaches the employee.
 */
export function NewCodeDialog({
  employee,
  onCancel,
  onConfirm,
}: NewCodeDialogProps) {
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isIssuing, setIsIssuing] = useState(false)

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
    setIsIssuing(true)
    try {
      await onConfirm(employee)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    } finally {
      setIsIssuing(false)
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
          <AlertDialogTitle>{NOTICES.confirmNewCodeTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {employee === null ? null : NOTICES.confirmNewCodeBody(employee.name)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {failure !== null && (
          <p className="text-sm text-destructive" role="alert">
            {errorText(failure, "team")}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isIssuing}>
            {LABELS.cancel}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction that closes on click: a failed write has
              to keep the dialog open to show why. The page closes it on success
              instead — and then opens the code dialog. */}
          <AlertDialogAction
            disabled={isIssuing}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {LABELS.newCode}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
