import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"

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
import { ShiftForm } from "@/components/shifts/ShiftForm"
import {
  getMockCycle,
  getTimeEntriesForUser,
  hoursBetween,
  isWithinCycle,
  type MockTimeEntry,
} from "@/mocks/data"

interface ShiftListProps {
  userId: number
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })

// Shared component — reused by both roles (architecture.md § Shared-page
// pattern): the employee route locks userId to "me", the admin route passes
// whichever employee they selected. No fetch here — local state only, seeded
// once from the mock ledger, so Add/Edit/Delete are demonstrable in the UI.
export function ShiftList({ userId }: ShiftListProps) {
  const [entries, setEntries] = useState<MockTimeEntry[]>(() => getTimeEntriesForUser(userId))
  const [cycleOffset, setCycleOffset] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<MockTimeEntry | undefined>(undefined)

  const cycle = getMockCycle(cycleOffset)
  const visibleEntries = entries
    .filter((entry) => isWithinCycle(entry, cycle.cycleStart, cycle.cycleEnd))
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

  function handleAddClick() {
    setEditingEntry(undefined)
    setFormOpen(true)
  }

  function handleEditClick(entry: MockTimeEntry) {
    setEditingEntry(entry)
    setFormOpen(true)
  }

  function handleDelete(id: number) {
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }

  function handleSave(data: { startTime: string; endTime: string | null; notes: string | null }) {
    if (editingEntry) {
      setEntries((current) =>
        current.map((entry) => (entry.id === editingEntry.id ? { ...entry, ...data } : entry))
      )
    } else {
      const nextId = Math.max(0, ...entries.map((entry) => entry.id)) + 1
      setEntries((current) => [...current, { id: nextId, userId, ...data }])
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <CycleNavigator
          cycleStart={cycle.cycleStart}
          cycleEnd={cycle.cycleEnd}
          onPrev={() => setCycleOffset((offset) => offset - 1)}
          onNext={() => setCycleOffset((offset) => offset + 1)}
        />
        <Button onClick={handleAddClick}>Add Shift</Button>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No shifts in this cycle.
                </TableCell>
              </TableRow>
            )}
            {visibleEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{dateFormatter.format(new Date(entry.startTime))}</TableCell>
                <TableCell>{timeFormatter.format(new Date(entry.startTime))}</TableCell>
                <TableCell>
                  {entry.endTime ? (
                    timeFormatter.format(new Date(entry.endTime))
                  ) : (
                    <Badge variant="destructive">Open</Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {entry.endTime ? hoursBetween(entry.startTime, entry.endTime).toFixed(1) : "—"}
                </TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">
                  {entry.notes ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit shift"
                    onClick={() => handleEditClick(entry)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete shift"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ShiftForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initialEntry={editingEntry}
        onSave={handleSave}
      />
    </div>
  )
}
