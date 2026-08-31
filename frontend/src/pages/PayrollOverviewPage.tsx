import { useSearchParams } from "react-router-dom"

import { getPayrollOverview } from "@/api/payroll"
import { PayrollOverview } from "@/components/payroll/PayrollOverview"
import { CycleNavigator } from "@/components/shifts/CycleNavigator"
import { Button } from "@/components/ui/button"
import { useApiQuery } from "@/hooks/useApiQuery"
import { errorText, LABELS, PAGE_TITLES } from "@/lib/messages"

/**
 * ADMIN only — the team's payroll for one cycle, in one request.
 *
 * The shape of this page is copied wholesale from `PayrollPage`: the cycle lives
 * in the URL, the read goes through `useApiQuery`, and the three states are
 * ordered error → loading → content. Nothing here is new, which is the point of
 * building this sub-step first.
 *
 * There is no `:userId` to validate: the route takes no parameter, so the
 * malformed-id case that both twin pages carry does not exist here.
 */
export function PayrollOverviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Omitted entirely on first load. The backend resolves "the cycle containing
  // now", which is not the current calendar month — a cycle runs 25 → 24.
  const cycle = searchParams.get("cycle") ?? undefined

  const { data, error, isLoading, refetch } = useApiQuery(
    () => getPayrollOverview(cycle),
    [cycle],
  )

  function goToCycle(key: string) {
    // ⚠️ `replace`, not `push` — five clicks on ◀ would otherwise leave five
    // history entries and Back would walk cycles instead of leaving the page.
    setSearchParams({ cycle: key }, { replace: true })
  }

  const heading = (
    <h1 className="text-xl font-semibold">{PAGE_TITLES.payrollOverview}</h1>
  )

  if (error !== null && data === null) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {heading}
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive" role="alert">
            {errorText(error, "payrollOverview")}
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

      <CycleNavigator
        cycleStart={data.cycleStart}
        cycleEnd={data.cycleEnd}
        onPrev={() => goToCycle(data.prevCycle)}
        onNext={() => goToCycle(data.nextCycle)}
        disabled={isLoading}
      />

      <PayrollOverview data={data} />
    </div>
  )
}
