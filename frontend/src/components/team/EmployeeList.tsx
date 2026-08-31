import { useNavigate } from "react-router-dom"
import { KeyRound, Pencil, UserCheck, UserMinus } from "lucide-react"

import { isPending, type UserResponse } from "@/api/users"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/datetime"
import { formatRate } from "@/lib/format"
import { LABELS, NOTICES } from "@/lib/messages"

interface EmployeeListProps {
  /** **Every** employee the API returned, deactivated ones included — the
   *  filtering happens here, so the count and the rows can never disagree. */
  employees: UserResponse[]
  showDeactivated: boolean
  onShowDeactivatedChange: (show: boolean) => void
  onEdit: (employee: UserResponse) => void
  onDeactivate: (employee: UserResponse) => void
  onReactivate: (employee: UserResponse) => void
  onNewCode: (employee: UserResponse) => void
}

/**
 * The badge, from the pair `isActive`/`hasActivated`.
 *
 * ⚠️ **Three states, and `isActive` is tested first.** A deactivated employee
 * keeps their password, so `hasActivated` stays `true` — a two-badge design
 * keyed off it alone prints "Active" beside someone who cannot sign in at all.
 * That is the specific bug this function exists to prevent (spec §8a).
 */
function statusBadge(employee: UserResponse) {
  if (!employee.isActive) {
    return <Badge variant="outline">{LABELS.badgeDeactivated}</Badge>
  }
  return employee.hasActivated ? (
    <Badge>{LABELS.badgeActive}</Badge>
  ) : (
    <Badge variant="secondary">{LABELS.badgePending}</Badge>
  )
}

/**
 * Clicking a row goes to that employee's Shift History — deactivated rows
 * included, since their history is exactly what deactivation preserves. The
 * action buttons stop propagation so they do not also navigate.
 */
export function EmployeeList({
  employees,
  showDeactivated,
  onShowDeactivatedChange,
  onEdit,
  onDeactivate,
  onReactivate,
  onNewCode,
}: EmployeeListProps) {
  const navigate = useNavigate()

  // Both derived from the same array in the same render, which is what keeps
  // the number in the toggle honest about what turning it on would reveal.
  const deactivatedCount = employees.filter(
    (employee) => !employee.isActive,
  ).length
  const visible = showDeactivated
    ? employees
    : employees.filter((employee) => employee.isActive)

  return (
    <div className="flex flex-col gap-3">
      {/* ⚠️ Rendered whenever anyone is deactivated, **including while the
          filter is off** — that is the whole point of the count. Without it an
          admin whose seasonal employee returns creates a second account, hits
          409, and never learns the first one is one click away. Hidden only when
          the count is zero, where it would be a control that reveals nothing. */}
      {deactivatedCount > 0 && (
        <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={showDeactivated}
            onCheckedChange={onShowDeactivatedChange}
          />
          {LABELS.showDeactivated(deactivatedCount)}
        </label>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {NOTICES.allEmployeesDeactivated}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{LABELS.columnName}</TableHead>
                <TableHead>{LABELS.email}</TableHead>
                <TableHead>{LABELS.columnHourlyRate}</TableHead>
                <TableHead>{LABELS.columnStatus}</TableHead>
                <TableHead className="text-right">
                  {LABELS.columnActions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((employee) => (
                <TableRow
                  key={employee.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/shifts/${employee.id}`)}
                >
                  <TableCell>{employee.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {employee.email}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {employee.hourlyRate === null
                      ? LABELS.emptyCell
                      : formatRate(employee.hourlyRate)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div>{statusBadge(employee)}</div>
                      {/* The code stays on the row, not only in the dialog, so
                          it survives a dialog closed too quickly and so an admin
                          can see one about to lapse and chase it. */}
                      {isPending(employee) && employee.setupCode !== null && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {employee.setupCode}
                          {employee.setupCodeExpiresAt !== null &&
                            ` · ${NOTICES.setupCodeValidUntil(
                              formatDate(employee.setupCodeExpiresAt),
                            )}`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={LABELS.editEmployee}
                        onClick={() => onEdit(employee)}
                      >
                        <Pencil className="size-4" />
                      </Button>

                      {/* ⚠️ Pending only. A deactivated employee who never
                          activated still carries a live code, but
                          set-initial-password checks `isActive` before it ever
                          looks at one — so re-issuing here would hand over a
                          code guaranteed to fail. */}
                      {isPending(employee) && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={LABELS.newCode}
                          onClick={() => onNewCode(employee)}
                        >
                          <KeyRound className="size-4" />
                        </Button>
                      )}

                      {/* Replaces rather than disables: an action that is
                          guaranteed to fail should not be on screen. */}
                      {employee.isActive ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={LABELS.deactivate}
                          onClick={() => onDeactivate(employee)}
                        >
                          <UserMinus className="size-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={LABELS.reactivate}
                          onClick={() => onReactivate(employee)}
                        >
                          <UserCheck className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
