import { useState } from "react"
import { toast } from "sonner"

import {
  createEmployee,
  deactivateEmployee,
  getEmployees,
  reactivateEmployee,
  resetPassword,
  resetSetupCode,
  updateEmployee,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
  type UserResponse,
} from "@/api/users"
import { DeactivateEmployeeDialog } from "@/components/team/DeactivateEmployeeDialog"
import { NewCodeDialog } from "@/components/team/NewCodeDialog"
import { ReactivateEmployeeDialog } from "@/components/team/ReactivateEmployeeDialog"
import { EmployeeForm } from "@/components/team/EmployeeForm"
import { EmployeeList } from "@/components/team/EmployeeList"
import { ResetPasswordDialog } from "@/components/team/ResetPasswordDialog"
import { SetupCodeDialog } from "@/components/team/SetupCodeDialog"
import { Button } from "@/components/ui/button"
import { useApiQuery } from "@/hooks/useApiQuery"
import { errorText, LABELS, NOTICES, PAGE_TITLES } from "@/lib/messages"

/** Which of the three moments opened the setup-code dialog. */
interface CodeDialogState {
  employee: UserResponse
  reason: "created" | "reissued" | "passwordReset"
}

/**
 * ADMIN only — where an admin lands after login, and the one page that carries
 * all seven user endpoints.
 *
 * The page's shape is the one every read page has used since step 11: the read
 * goes through `useApiQuery`, the states are ordered error → loading → empty →
 * content, and every write is explicit, followed by `refetch()`.
 *
 * ⚠️ **Every row action confirms first, and each confirmation holds its own
 * failures.** `Reactivate` and `New code` used to fire straight from their
 * buttons with `toast.error` as the only place a failure could land; they now
 * have dialogs like `Deactivate` and `Reset password`. The consistency is the
 * point: a single button that acts immediately while its neighbours all stop to
 * ask is the one that gets clicked by accident.
 *
 * That also moves `SCREEN_ERRORS.team` into the dialogs, where it is read rather
 * than glimpsed — `ACCOUNT_ALREADY_ACTIVATED` comes back from
 * `reset-setup-code` when the list is stale, and the whole point of the
 * per-screen override written in step 9 is that an admin needs "refresh the
 * list", not the employee's "go and sign in".
 *
 * The four confirmations differ only in what their sentence has to carry: the
 * two that replace a credential (`Reset password`, `New code`) say that the old
 * one stops working· `Deactivate` says the row survives· `Reactivate` says the
 * old password still works.
 */
export function TeamPage() {
  const { data, error, refetch } = useApiQuery(getEmployees, [])

  const [showDeactivated, setShowDeactivated] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserResponse | undefined>(undefined)
  const [codeDialog, setCodeDialog] = useState<CodeDialogState | null>(null)
  const [deactivating, setDeactivating] = useState<UserResponse | null>(null)
  const [resettingPassword, setResettingPassword] =
    useState<UserResponse | null>(null)
  const [reactivating, setReactivating] = useState<UserResponse | null>(null)
  const [issuingCode, setIssuingCode] = useState<UserResponse | null>(null)

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(employee: UserResponse) {
    setEditing(employee)
    setFormOpen(true)
  }

  /**
   * ⚠️ The **only** place that decides between POST and PUT, and it does so from
   * the same `editing` value the form was seeded with. The form does not know
   * which endpoint it is driving — it only knows which fields it may send.
   *
   * Rejections are not caught: the form needs them to stay open and show why.
   */
  function submitEmployee(
    input: CreateEmployeeInput | UpdateEmployeeInput,
  ): Promise<UserResponse> {
    return editing === undefined
      ? createEmployee(input as CreateEmployeeInput)
      : updateEmployee(editing.id, input as UpdateEmployeeInput)
  }

  /**
   * ⚠️ A create takes **no toast** — it opens the code dialog instead, which is
   * louder and which the admin has to act on. An edit takes none either: the
   * refetched row shows the new name and rate, which is the toast rule's own
   * condition for not needing one.
   */
  function handleSaved(saved: UserResponse) {
    const wasCreate = editing === undefined
    refetch()
    if (wasCreate) setCodeDialog({ employee: saved, reason: "created" })
  }

  /**
   * Rethrows nothing and catches nothing: `DeactivateEmployeeDialog` needs the
   * rejection to stay open with the reason inside it.
   */
  async function confirmDeactivate(employee: UserResponse) {
    await deactivateEmployee(employee.id)
    refetch()
    setDeactivating(null)
    // The one toast on this page. With the filter closed — the default — the
    // row simply vanishes, and that reads as a hard delete of someone whose
    // payroll history is in fact kept.
    toast.success(NOTICES.employeeDeactivated(employee.name))
  }

  /**
   * Catches nothing, like `confirmDeactivate` — `ResetPasswordDialog` needs the
   * rejection to stay open with the reason inside it.
   *
   * ⚠️ **No toast, and the ending is what makes this write different from every
   * other one here.** Success closes the confirmation and immediately opens the
   * code dialog: the reset is not finished when the request returns, only when
   * the code has reached the employee, and this app has no channel to deliver it
   * — the admin reads it out. A toast would announce completion at the moment
   * the job is half done.
   */
  async function confirmResetPassword(employee: UserResponse) {
    const updated = await resetPassword(employee.id)
    refetch()
    setResettingPassword(null)
    setCodeDialog({ employee: updated, reason: "passwordReset" })
  }

  /**
   * Catches nothing, like the two above — `ReactivateEmployeeDialog` needs the
   * rejection to stay open with the reason inside it.
   *
   * No toast: the row reappearing in the list *is* the confirmation, which is
   * the toast rule's own condition. That is also why deactivation takes one and
   * this does not — there the row vanishes instead.
   */
  async function confirmReactivate(employee: UserResponse) {
    await reactivateEmployee(employee.id)
    refetch()
    setReactivating(null)
  }

  /**
   * Catches nothing, like its siblings — `NewCodeDialog` needs the rejection to
   * stay open with the reason inside it.
   *
   * The response carries the new code, so nothing here needs a follow-up read to
   * show it — but the list behind the dialog is refetched anyway, because the
   * row prints the code too and would otherwise still show the dead one.
   *
   * ⚠️ Ends the same way `confirmResetPassword` does, and for the same reason:
   * the job is not finished when the request returns, only when the code has
   * reached the employee. So this closes the confirmation and opens the code
   * dialog rather than announcing success.
   */
  async function confirmNewCode(employee: UserResponse) {
    const updated = await resetSetupCode(employee.id)
    refetch()
    setIssuingCode(null)
    setCodeDialog({ employee: updated, reason: "reissued" })
  }

  const heading = (
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-semibold">{PAGE_TITLES.team}</h1>
      <Button onClick={openCreate}>{LABELS.addEmployee}</Button>
    </div>
  )

  if (error !== null && data === null) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {heading}
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive" role="alert">
            {errorText(error, "team")}
          </p>
          <Button onClick={refetch}>{LABELS.retry}</Button>
        </div>
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {heading}
        <p className="text-sm text-muted-foreground" role="status">
          {LABELS.loading}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {heading}

      {/* Nobody is employed at all. Distinct from every employee being
          deactivated, which `EmployeeList` answers with its own sentence and a
          toggle that recovers from it. */}
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {NOTICES.noEmployees}
        </p>
      ) : (
        <EmployeeList
          employees={data}
          showDeactivated={showDeactivated}
          onShowDeactivatedChange={setShowDeactivated}
          onEdit={openEdit}
          onDeactivate={setDeactivating}
          onReactivate={setReactivating}
          onNewCode={setIssuingCode}
          onResetPassword={setResettingPassword}
        />
      )}

      <EmployeeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        employee={editing}
        onSubmit={submitEmployee}
        onSaved={handleSaved}
      />

      <SetupCodeDialog
        employee={codeDialog?.employee ?? null}
        reason={codeDialog?.reason ?? "created"}
        onClose={() => setCodeDialog(null)}
      />

      <DeactivateEmployeeDialog
        employee={deactivating}
        onCancel={() => setDeactivating(null)}
        onConfirm={confirmDeactivate}
      />

      <ResetPasswordDialog
        employee={resettingPassword}
        onCancel={() => setResettingPassword(null)}
        onConfirm={confirmResetPassword}
      />

      <ReactivateEmployeeDialog
        employee={reactivating}
        onCancel={() => setReactivating(null)}
        onConfirm={confirmReactivate}
      />

      <NewCodeDialog
        employee={issuingCode}
        onCancel={() => setIssuingCode(null)}
        onConfirm={confirmNewCode}
      />
    </div>
  )
}
