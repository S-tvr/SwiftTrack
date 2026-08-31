import { useParams, useSearchParams } from "react-router-dom"

import { getMyPayroll, getPayrollForUser } from "@/api/payroll"
import { PayrollDayTable } from "@/components/payroll/PayrollDayTable"
import { PayrollSummary } from "@/components/payroll/PayrollSummary"
import { CycleNavigator } from "@/components/shifts/CycleNavigator"
import { Button } from "@/components/ui/button"
import { useApiQuery } from "@/hooks/useApiQuery"
import { errorText, LABELS, NOTICES, PAGE_TITLES } from "@/lib/messages"

/**
 * One page, two routes: the employee's own breakdown at `/payroll`, an admin's
 * view of one employee at `/payroll/:userId`. Both endpoints answer the same
 * shape, so only the fetcher differs — and the heading, which prints the name
 * the response already carries rather than making a second call to `GET /users`
 * for one label.
 *
 * ⚠️ **The page performs no arithmetic of any kind**, the Total rows included.
 * Everything on screen is printed exactly as the server sent it.
 */
export function PayrollPage() {
  const { userId: userIdParam } = useParams<{ userId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  // ⚠️ `?cycle=` lives in the URL, not in component state — the same rule as
  // step 11, and this is the page that pays for it: step 13's Payroll Overview
  // drills down to `/payroll/:userId?cycle=<the cycle it was showing>`, so with
  // component state an admin would click a July figure and land in August.
  // Omitted entirely on first load, letting the backend resolve "the cycle
  // containing now", which is not the current calendar month.
  const cycle = searchParams.get("cycle") ?? undefined

  const employeeId = userIdParam === undefined ? null : Number(userIdParam)
  const isAdminRoute = employeeId !== null
  const hasValidId = employeeId === null || Number.isInteger(employeeId)

  const { data, error, isLoading, refetch } = useApiQuery(
    () =>
      employeeId === null
        ? getMyPayroll(cycle)
        : getPayrollForUser(employeeId, cycle),
    [employeeId, cycle],
  )

  function goToCycle(key: string) {
    // ⚠️ `replace`, not `push` — five clicks on ◀ would otherwise leave five
    // history entries and Back would walk cycles instead of leaving the page.
    setSearchParams({ cycle: key }, { replace: true })
  }

  const heading = (
    <div>
      <h1 className="text-xl font-semibold">{PAGE_TITLES.payrollBreakdown}</h1>
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
            {errorText(
              hasValidId && error !== null ? error : "EMPLOYEE_NOT_FOUND",
              "payroll",
            )}
          </p>
          {hasValidId && <Button onClick={refetch}>{LABELS.retry}</Button>}
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

      <CycleNavigator
        cycleStart={data.cycleStart}
        cycleEnd={data.cycleEnd}
        onPrev={() => goToCycle(data.prevCycle)}
        onNext={() => goToCycle(data.nextCycle)}
        disabled={isLoading}
      />

      {/* The only thing that can explain a day missing from the table below.
          An open shift cannot be priced, so its date is absent entirely — and
          without this line that gap reads as a bug. */}
      {data.hasOpenShift && (
        <p className="rounded-lg border border-foreground/10 px-3 py-2 text-sm text-muted-foreground">
          {isAdminRoute ? NOTICES.openShiftOther : NOTICES.openShiftOwn}
        </p>
      )}

      {data.days.length === 0 ? (
        // An empty state, not two tables of zeros. Note it stays *below* the
        // open-shift line, which is precisely the case where a cycle looks
        // empty for a reason worth stating.
        <p className="text-sm text-muted-foreground">
          {NOTICES.noHoursInCycle}
        </p>
      ) : (
        <>
          <PayrollSummary data={data} />
          <PayrollDayTable data={data} />
        </>
      )}
    </div>
  )
}
