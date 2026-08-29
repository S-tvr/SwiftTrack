import { ClockButton } from "@/components/clock/ClockButton"
import { PAGE_TITLES } from "@/lib/messages"

/**
 * EMPLOYEE only — the admin has no clock and lands on /team instead
 * (architecture.md § Invariants, enforced by ProtectedRoute in App.tsx).
 *
 * The page is the button. The step-0 month summary is gone: it computed pay as
 * `hours × hourlyRate`, which under four rate zones is materially wrong for
 * anyone working evenings or weekends. Hours and money live on /payroll, where
 * the server sends both already calculated.
 */
export function ClockPage() {
  return (
    <div className="flex flex-col items-center gap-6 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{PAGE_TITLES.clock}</h1>
      <ClockButton />
    </div>
  )
}
