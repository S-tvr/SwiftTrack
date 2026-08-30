import { Pencil, Split, Trash2 } from "lucide-react"

import type { CycleEntriesResponse, CycleTimeEntry } from "@/api/timeEntries"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CycleNavigator } from "@/components/shifts/CycleNavigator"
import { formatDayTime } from "@/lib/datetime"
import { LABELS, NOTICES } from "@/lib/messages"

interface ShiftListProps {
  data: CycleEntriesResponse
  onPrev: () => void
  onNext: () => void
  onAdd: () => void
  onEdit: (entry: CycleTimeEntry) => void
  onDelete: (entry: CycleTimeEntry) => void
  /** A read is in flight — the rows on screen belong to the previous cycle
   *  until it lands, so the controls that would start another are held. */
  isRefreshing?: boolean
}

/**
 * Shared by both routes: the employee's own history at `/shifts` and an admin's
 * view of one employee at `/shifts/:userId`. The two responses are the same
 * shape by design, so nothing here branches on role.
 *
 * Presentational — it fetches nothing and writes nothing. The page owns the
 * query and the four callbacks.
 *
 * ⚠️ **No Hours or Duration column, and it must stay that way.** The API returns
 * no hours figure on purpose (spec §4, decision 5f), and computing one here
 * would be wrong rather than merely forbidden: a **split** shift appears in
 * *both* cycles carrying its full `startTime`/`endTime`, so a duration column
 * would show 7h twice for one 7-hour shift — the exact double-count that
 * splitting exists to prevent. Hours live on the Payroll page, per zone, once.
 */
export function ShiftList({
  data,
  onPrev,
  onNext,
  onAdd,
  onEdit,
  onDelete,
  isRefreshing = false,
}: ShiftListProps) {
  /**
   * ⚠️ The explanation for a locked row is rendered **visibly**, not as a
   * `title` tooltip. A `title` on a *disabled* button is unreliable across
   * browsers and is never announced to a keyboard or screen-reader user — so
   * the buttons would simply be dead with no stated reason, while `canWrite`
   * was explained in plain text twenty pixels above.
   *
   * Once below the table rather than once per row: a closed cycle locks every
   * row, and repeating the same sentence twenty-three times is noise, not
   * clarity. `aria-describedby` is what ties the disabled buttons to it.
   */
  const hasLockedRows = data.entries.some((entry) => !entry.canEdit)
  const lockedNoteId = "shift-list-locked-note"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <CycleNavigator
          cycleStart={data.cycleStart}
          cycleEnd={data.cycleEnd}
          onPrev={onPrev}
          onNext={onNext}
          disabled={isRefreshing}
        />
        {/* Read straight from `canWrite` — never worked out from the dates on
            screen, which would mean resolving cycle boundaries client-side. A
            POST has no row to carry a per-entry flag, which is why this one
            exists separately from canEdit. */}
        <div className="flex flex-col items-center gap-1 sm:items-end">
          <Button onClick={onAdd} disabled={!data.canWrite || isRefreshing}>
            {LABELS.addShift}
          </Button>
          {!data.canWrite && (
            <p className="text-xs text-muted-foreground">
              {NOTICES.cycleLocked}
            </p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">{LABELS.columnNumber}</TableHead>
              <TableHead>{LABELS.columnStart}</TableHead>
              <TableHead>{LABELS.columnEnd}</TableHead>
              <TableHead>{LABELS.columnNotes}</TableHead>
              <TableHead className="text-right">
                {LABELS.columnActions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  {NOTICES.noShiftsInCycle}
                </TableCell>
              </TableRow>
            )}
            {data.entries.map((entry, index) => (
              <TableRow key={entry.id}>
                {/* Position in the cycle, not an identity. The rows arrive
                    newest first, so #1 is the most recent shift — it is a
                    reading aid for talking about a row ("the third one"), and
                    deliberately not the entry's id, which means nothing to
                    anyone reading a payslip. */}
                <TableCell className="text-muted-foreground tabular-nums">
                  {index + 1}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {formatDayTime(entry.startTime)}
                    {/* Explains the same shift appearing in the neighbouring
                        cycle, before that reads as a duplicate-row bug. On the
                        start, because that is what the cycle and the lock are
                        both anchored on. */}
                    {entry.isSplit && (
                      <Split
                        className="size-3.5 text-muted-foreground"
                        aria-label={LABELS.badgeSplit}
                      >
                        <title>{NOTICES.splitShift}</title>
                      </Split>
                    )}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {/* Carries its own date, which is the whole reason there is no
                      shared Date column: an overnight shift ends on a different
                      day than it starts, and one cell could print only one. */}
                  {entry.endTime === null ? (
                    /* The only screen on which someone who forgot to clock out
                       can find and fix it — which is why the list query includes
                       open shifts and the payroll query does not. */
                    <Badge variant="destructive">{LABELS.badgeOpen}</Badge>
                  ) : (
                    formatDayTime(entry.endTime)
                  )}
                </TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">
                  {entry.notes ?? "—"}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {/* One flag, two buttons: `canEdit` reports whether the caller
                      may edit *or delete* this row. Always true for an admin. */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={LABELS.editShift}
                    aria-describedby={entry.canEdit ? undefined : lockedNoteId}
                    disabled={!entry.canEdit || isRefreshing}
                    onClick={() => onEdit(entry)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={LABELS.deleteShift}
                    aria-describedby={entry.canEdit ? undefined : lockedNoteId}
                    disabled={!entry.canEdit || isRefreshing}
                    onClick={() => onDelete(entry)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {hasLockedRows && (
        <p id={lockedNoteId} className="text-xs text-muted-foreground">
          {NOTICES.rowLocked}
        </p>
      )}
    </div>
  )
}
