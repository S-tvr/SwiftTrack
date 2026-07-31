import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircle } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  getMockCycle,
  getTimeEntriesForUser,
  hoursBetween,
  isWithinCycle,
  mockEmployees,
} from "@/mocks/data"

// Admin only — team totals + open-shift flags per employee (spec §8). Row
// click goes to that employee's Payroll Breakdown. Cycle math (getMockCycle)
// is a mock-only stand-in, replaced by the backend response in step 13.
export function PayrollOverview() {
  const [cycleOffset, setCycleOffset] = useState(0)
  const navigate = useNavigate()
  const cycle = getMockCycle(cycleOffset)

  const rows = mockEmployees.map((employee) => {
    const entries = getTimeEntriesForUser(employee.id)
    const closedInCycle = entries
      .filter((entry) => entry.endTime !== null)
      .filter((entry) => isWithinCycle(entry, cycle.cycleStart, cycle.cycleEnd))
    const totalHours = closedInCycle.reduce(
      (sum, entry) => sum + hoursBetween(entry.startTime, entry.endTime!),
      0
    )
    const totalPay = Math.round(totalHours * (employee.hourlyRate ?? 0))
    const hasOpenShift = entries.some((entry) => entry.endTime === null)
    return { employee, totalHours, totalPay, hasOpenShift }
  })

  const totalMonthlyCost = rows.reduce((sum, row) => sum + row.totalPay, 0)

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
          <CardTitle className="text-base">Total Monthly Cost</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {totalMonthlyCost.toLocaleString("en-US")} ISK
          </p>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Pay</TableHead>
              <TableHead>Open Shift</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ employee, totalHours, totalPay, hasOpenShift }) => (
              <TableRow
                key={employee.id}
                className="cursor-pointer"
                onClick={() => navigate(`/payroll/${employee.id}`)}
              >
                <TableCell>{employee.name}</TableCell>
                <TableCell className="tabular-nums">{totalHours.toFixed(1)}</TableCell>
                <TableCell className="tabular-nums">
                  {totalPay.toLocaleString("en-US")} ISK
                </TableCell>
                <TableCell>
                  {hasOpenShift && (
                    <AlertCircle className="size-4 text-destructive" aria-label="Open shift" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
