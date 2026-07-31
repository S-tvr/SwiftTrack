import { useNavigate } from "react-router-dom"
import { Pencil } from "lucide-react"

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
import { LABELS } from "@/lib/messages"
import type { MockUser } from "@/mocks/data"

interface EmployeeListProps {
  employees: MockUser[]
  onEdit: (employee: MockUser) => void
}

// Clicking a row goes to that employee's Shift History (spec §8, Team page).
// The Edit button stops propagation so it doesn't also trigger the navigate.
export function EmployeeList({ employees, onEdit }: EmployeeListProps) {
  const navigate = useNavigate()

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Hourly Rate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => (
            <TableRow
              key={employee.id}
              className="cursor-pointer"
              onClick={() => navigate(`/shifts/${employee.id}`)}
            >
              <TableCell>{employee.name}</TableCell>
              <TableCell className="text-muted-foreground">{employee.email}</TableCell>
              <TableCell className="tabular-nums">
                {employee.hourlyRate?.toLocaleString("en-US") ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={employee.hasActivated ? "default" : "secondary"}>
                    {employee.hasActivated ? LABELS.badgeActive : LABELS.badgePending}
                  </Badge>
                  {!employee.hasActivated && employee.setupCode && (
                    <span className="text-xs text-muted-foreground">
                      Code: {employee.setupCode}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit employee"
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(employee)
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
