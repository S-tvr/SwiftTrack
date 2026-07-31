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
import type { MockUser } from "@/mocks/data"

interface EmployeeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialEmployee?: MockUser
  onSave: (data: { name: string; email: string; hourlyRate: number }) => void
}

// PUT /users/:id only edits name/hourlyRate (spec §6) — email is locked once
// created, so the field is disabled (not hidden) in edit mode for context.
export function EmployeeForm({
  open,
  onOpenChange,
  initialEmployee,
  onSave,
}: EmployeeFormProps) {
  const [name, setName] = useState(initialEmployee?.name ?? "")
  const [email, setEmail] = useState(initialEmployee?.email ?? "")
  const [hourlyRate, setHourlyRate] = useState(
    initialEmployee?.hourlyRate != null ? String(initialEmployee.hourlyRate) : ""
  )

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({ name, email, hourlyRate: Number(hourlyRate) })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{initialEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle>
            <DialogDescription>
              {initialEmployee
                ? "Update this employee's name or hourly rate."
                : "A 4-digit activation code is generated automatically — hand it to the employee yourself."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={Boolean(initialEmployee)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hourlyRate">Hourly Rate (ISK)</Label>
              <Input
                id="hourlyRate"
                type="number"
                min={0}
                step={1}
                value={hourlyRate}
                onChange={(event) => setHourlyRate(event.target.value)}
                required
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
