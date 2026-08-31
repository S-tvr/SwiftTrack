import type { UserResponse } from "@/api/users"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDate } from "@/lib/datetime"
import { LABELS, NOTICES } from "@/lib/messages"

interface SetupCodeDialogProps {
  /** The employee whose code is being handed over, or null when closed. */
  employee: UserResponse | null
  /** Which of the two moments this is — a fresh account, or a re-issue. */
  reason: "created" | "reissued"
  onClose: () => void
}

/**
 * The setup code, shown once the server has issued it.
 *
 * **Why this is a dialog and not a toast, and why it has two call sites.**
 * Creating an account is really two actions — make the row, then hand the code
 * over out of band — and the second one is invisible if the form simply closes:
 * the admin believes they are finished. Re-issuing has the identical problem, so
 * `New code` opens this same component rather than quietly refreshing the row,
 * where the only evidence would be four digits changing inside a table.
 *
 * ⚠️ **Read-only, and deliberately not a confirmation.** Nothing here can fail
 * and nothing can be cancelled — the write already succeeded before this opened,
 * which is why the button says Done rather than OK or Cancel, and why this is a
 * `Dialog` rather than the `AlertDialog` that `DeactivateEmployeeDialog` uses.
 *
 * The code also stays on the pending row behind this, so closing it too quickly
 * costs nothing.
 */
export function SetupCodeDialog({
  employee,
  reason,
  onClose,
}: SetupCodeDialogProps) {
  return (
    <Dialog
      open={employee !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {reason === "created" ? NOTICES.setupCodeTitle : NOTICES.newCodeTitle}
          </DialogTitle>
          <DialogDescription>
            {employee === null ? null : NOTICES.setupCodeBody(employee.name)}
          </DialogDescription>
        </DialogHeader>

        {/* The code is the whole content of this dialog, so it is set at a size
            that can be read across a desk and copied onto paper without
            squinting. `tracking-widest` keeps the four digits separable. */}
        <p className="py-2 text-center font-mono text-4xl font-semibold tracking-widest tabular-nums">
          {employee?.setupCode}
        </p>

        <p className="text-center text-sm text-muted-foreground">
          {employee?.setupCodeExpiresAt == null
            ? null
            : NOTICES.setupCodeValidUntil(formatDate(employee.setupCodeExpiresAt))}
        </p>

        <DialogFooter>
          <Button onClick={onClose}>{LABELS.done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
