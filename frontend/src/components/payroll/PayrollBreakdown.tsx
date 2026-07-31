import { useState } from "react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CycleNavigator } from "@/components/shifts/CycleNavigator"
import {
  getEmployeeById,
  getMockCycle,
  getTimeEntriesForUser,
  hoursBetween,
  isWithinCycle,
} from "@/mocks/data"

interface PayrollBreakdownProps {
  userId: number
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

// Shared component — reused by both roles (architecture.md § Shared-page
// pattern): employee route locks userId to "me", admin route passes the
// selected employee. Cycle math (getMockCycle) is a mock-only stand-in — the
// real cycleStart/cycleEnd and totalPay come from GET /payroll in step 12.
export function PayrollBreakdown({ userId }: PayrollBreakdownProps) {
  const [cycleOffset, setCycleOffset] = useState(0)
  const employee = getEmployeeById(userId)
  const cycle = getMockCycle(cycleOffset)

  const closedEntries = getTimeEntriesForUser(userId)
    .filter((entry) => entry.endTime !== null)
    .filter((entry) => isWithinCycle(entry, cycle.cycleStart, cycle.cycleEnd))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  const totalHours = closedEntries.reduce(
    (sum, entry) => sum + hoursBetween(entry.startTime, entry.endTime!),
    0
  )
  const hourlyRate = employee?.hourlyRate ?? 0
  const totalPay = Math.round(totalHours * hourlyRate)

  return (
    <div className="flex flex-col gap-4">
      <CycleNavigator
        cycleStart={cycle.cycleStart}
        cycleEnd={cycle.cycleEnd}
        onPrev={() => setCycleOffset((offset) => offset - 1)}
        onNext={() => setCycleOffset((offset) => offset + 1)}
      />

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Hours</p>
            <p className="text-xl font-semibold tabular-nums">{totalHours.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="text-xl font-semibold tabular-nums">{hourlyRate.toLocaleString("en-US")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Pay</p>
            <p className="text-xl font-semibold tabular-nums">
              {totalPay.toLocaleString("en-US")} ISK
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead className="text-right">Pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {closedEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No closed shifts in this cycle.
                </TableCell>
              </TableRow>
            )}
            {closedEntries.map((entry) => {
              const hours = hoursBetween(entry.startTime, entry.endTime!)
              return (
                <TableRow key={entry.id}>
                  <TableCell>{dateFormatter.format(new Date(entry.startTime))}</TableCell>
                  <TableCell className="tabular-nums">{hours.toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(hours * hourlyRate).toLocaleString("en-US")} ISK
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
