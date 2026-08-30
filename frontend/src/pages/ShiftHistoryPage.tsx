import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import {
  createEntry,
  deleteEntry,
  getEntriesForUser,
  getMyEntries,
  updateEntry,
  type CycleTimeEntry,
  type TimeEntryInput,
} from "@/api/timeEntries"
import { Button } from "@/components/ui/button"
import { DeleteShiftDialog } from "@/components/shifts/DeleteShiftDialog"
import { ShiftForm } from "@/components/shifts/ShiftForm"
import { ShiftList } from "@/components/shifts/ShiftList"
import { useApiQuery } from "@/hooks/useApiQuery"
import { errorText, LABELS, NOTICES, PAGE_TITLES } from "@/lib/messages"

/**
 * One page, two routes: the employee's own history at `/shifts`, an admin's
 * view of one employee at `/shifts/:userId`. Both endpoints answer the same
 * shape, so only the fetcher differs — and the heading, which prints the name
 * the response carries (step 8d) rather than making a second call to
 * `GET /users` for one label.
 */
export function ShiftHistoryPage() {
  const { userId: userIdParam } = useParams<{ userId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  // ⚠️ `?cycle=` lives in the URL, not in component state: a refresh keeps your
  // place, `/shifts/3?cycle=2026-07` is a link an admin can send, and step 13's
  // drill-down from Payroll Overview lands on the cycle they were looking at.
  // Omitted entirely on first load — the backend resolves "the cycle containing
  // now", which is not the current calendar month.
  const cycle = searchParams.get("cycle") ?? undefined

  const employeeId = userIdParam === undefined ? null : Number(userIdParam)
  const isAdminRoute = employeeId !== null
  const hasValidId = employeeId === null || Number.isInteger(employeeId)

  const { data, error, isLoading, refetch } = useApiQuery(
    () =>
      employeeId === null
        ? getMyEntries(cycle)
        : getEntriesForUser(employeeId, cycle),
    [employeeId, cycle],
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CycleTimeEntry | undefined>(undefined)
  const [deleting, setDeleting] = useState<CycleTimeEntry | null>(null)

  /**
   * Which row a just-completed save produced, held until the refetch behind it
   * lands so the toast can say whether the shift is actually on screen.
   *
   * A **ref**, not state: the check runs in an effect, and writing state there
   * would trip `react-hooks/set-state-in-effect` and cost an extra render for a
   * value nothing renders.
   */
  const savedIdRef = useRef<number | null>(null)

  /**
   * ⚠️ The one thing that cannot be worked out from the write's own response:
   * whether the saved shift belongs to the cycle on screen. Deciding that from
   * `startTime` and the cycle bounds would mean reimplementing the server's
   * overlap rule in the browser. Asking the refreshed list whether the row is in
   * it needs no arithmetic at all — and it gets split shifts right for free,
   * since those really are visible in both cycles.
   */
  useEffect(() => {
    const savedId = savedIdRef.current
    if (savedId === null || isLoading) return

    if (data !== null) {
      savedIdRef.current = null
      toast.success(
        data.entries.some((entry) => entry.id === savedId)
          ? NOTICES.shiftSaved
          : NOTICES.shiftSavedOtherCycle,
      )
      return
    }

    if (error !== null) {
      // The write landed; only the reload behind it failed. Saying so is more
      // honest than staying silent and letting the page's error read as if the
      // save had been lost.
      savedIdRef.current = null
      toast.success(NOTICES.shiftSaved)
    }
  }, [data, error, isLoading])

  function goToCycle(key: string) {
    // ⚠️ `replace`, not `push`: five clicks on ◀ would otherwise leave five
    // history entries, and Back would walk the user cycle by cycle instead of
    // leaving the page.
    setSearchParams({ cycle: key }, { replace: true })
  }

  async function submitShift(input: TimeEntryInput) {
    if (editing) return updateEntry(editing.id, input)
    // ⚠️ `userId` is required when an admin submits and rejected when an
    // employee does. Without it on this route the shift is written to the
    // *admin's own* account, which has no hourlyRate and appears on no page —
    // invisible, and never paid.
    return createEntry(
      isAdminRoute ? { ...input, userId: employeeId } : input,
    )
  }

  async function confirmDelete(entry: CycleTimeEntry) {
    await deleteEntry(entry.id)
    setDeleting(null)
    toast.success(NOTICES.shiftDeleted)
    refetch()
  }

  const heading = (
    <div>
      <h1 className="text-xl font-semibold">{PAGE_TITLES.shiftHistory}</h1>
      {/* Only on the admin route. On their own page the employee's name is
          already in the header, and the response's `name` is their own. */}
      {isAdminRoute && data !== null && (
        <p className="text-sm text-muted-foreground">{data.name}</p>
      )}
    </div>
  )

  if (!hasValidId || (error !== null && data === null)) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {heading}
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive" role="alert">
            {errorText(hasValidId && error !== null ? error : "EMPLOYEE_NOT_FOUND", "shifts")}
          </p>
          {hasValidId && <Button onClick={refetch}>{LABELS.retry}</Button>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {heading}

      {data === null ? (
        <p className="text-sm text-muted-foreground" role="status">
          {LABELS.loading}
        </p>
      ) : (
        <ShiftList
          data={data}
          isRefreshing={isLoading}
          onPrev={() => goToCycle(data.prevCycle)}
          onNext={() => goToCycle(data.nextCycle)}
          onAdd={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
          onEdit={(entry) => {
            setEditing(entry)
            setFormOpen(true)
          }}
          onDelete={setDeleting}
        />
      )}

      <ShiftForm
        open={formOpen}
        onOpenChange={setFormOpen}
        entry={editing}
        onSubmit={submitShift}
        onSaved={(saved) => {
          savedIdRef.current = saved.id
          refetch()
        }}
      />

      <DeleteShiftDialog
        entry={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
