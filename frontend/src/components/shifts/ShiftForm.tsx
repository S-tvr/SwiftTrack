import { useState, type SubmitEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { MockTimeEntry } from "@/mocks/data"

interface ShiftFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialEntry?: MockTimeEntry
  onSave: (entry: { startTime: string; endTime: string | null; notes: string | null }) => void
}

// All timestamps are UTC with no DST (spec §3) — the datetime-local input's
// local value is used as-is, no timezone conversion.
function toInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 16) : ""
}

function fromInputValue(value: string): string | null {
  return value ? `${value}:00.000Z` : null
}

export function ShiftForm({ open, onOpenChange, initialEntry, onSave }: ShiftFormProps) {
  const [startTime, setStartTime] = useState(toInputValue(initialEntry?.startTime ?? null))
  const [endTime, setEndTime] = useState(toInputValue(initialEntry?.endTime ?? null))
  const [notes, setNotes] = useState(initialEntry?.notes ?? "")

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({
      startTime: fromInputValue(startTime)!,
      endTime: fromInputValue(endTime),
      notes: notes || null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{initialEntry ? "Edit Shift" : "Add Shift"}</DialogTitle>
            <DialogDescription>
              {initialEntry
                ? "Update the start/end time or notes for this shift."
                : "Add a forgotten or missing shift."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
