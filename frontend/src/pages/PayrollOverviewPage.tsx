import { PayrollOverview } from "@/components/payroll/PayrollOverview"
import { PAGE_TITLES } from "@/lib/messages"

export function PayrollOverviewPage() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{PAGE_TITLES.payrollOverview}</h1>
      <PayrollOverview />
    </div>
  )
}
