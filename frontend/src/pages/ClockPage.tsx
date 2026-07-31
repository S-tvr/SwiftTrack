import { useState } from "react"

import { ClockButton } from "@/components/clock/ClockButton"
import { MonthSummary } from "@/components/clock/MonthSummary"
import { PAGE_TITLES } from "@/lib/messages"
import { currentUser, getTimeEntriesForUser } from "@/mocks/data"

// EMPLOYEE only — admin never sees this page (architecture.md § Invariants).
export function ClockPage() {
  const entries = getTimeEntriesForUser(currentUser.id)
  // Seeded from the mock data's open shift; toggling here is local UI state
  // only (see ClockButton) — it doesn't touch entries/totals below.
  const [isOpen, setIsOpen] = useState(() =>
    entries.some((entry) => entry.endTime === null)
  )

  const totalHours = entries
    .filter((entry) => entry.endTime !== null)
    .reduce((sum, entry) => {
      const hours =
        (new Date(entry.endTime!).getTime() - new Date(entry.startTime).getTime()) /
        (1000 * 60 * 60)
      return sum + hours
    }, 0)

  const estimatedPay = Math.round(totalHours * (currentUser.hourlyRate ?? 0))

  return (
    <div className="flex flex-col items-center gap-6 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{PAGE_TITLES.clock}</h1>
      <ClockButton isOpen={isOpen} onToggle={() => setIsOpen((open) => !open)} />
      <MonthSummary totalHours={totalHours} estimatedPay={estimatedPay} />
    </div>
  )
}
