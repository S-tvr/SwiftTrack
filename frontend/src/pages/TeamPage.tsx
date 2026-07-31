import { useState } from "react"

import { Button } from "@/components/ui/button"
import { EmployeeForm } from "@/components/team/EmployeeForm"
import { EmployeeList } from "@/components/team/EmployeeList"
import { PAGE_TITLES } from "@/lib/messages"
import { mockEmployees, type MockUser } from "@/mocks/data"

function generateSetupCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// Admin only — first page after admin login (spec §8). Local state only, no
// fetch — POST/PUT /users wiring happens in step 13.
export function TeamPage() {
  const [employees, setEmployees] = useState<MockUser[]>(mockEmployees)
  const [formOpen, setFormOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<MockUser | undefined>(undefined)

  function handleAddClick() {
    setEditingEmployee(undefined)
    setFormOpen(true)
  }

  function handleEditClick(employee: MockUser) {
    setEditingEmployee(employee)
    setFormOpen(true)
  }

  function handleSave(data: { name: string; email: string; hourlyRate: number }) {
    if (editingEmployee) {
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === editingEmployee.id
            ? { ...employee, name: data.name, hourlyRate: data.hourlyRate }
            : employee
        )
      )
    } else {
      const nextId = Math.max(0, ...employees.map((employee) => employee.id)) + 1
      setEmployees((current) => [
        ...current,
        {
          id: nextId,
          name: data.name,
          email: data.email,
          role: "EMPLOYEE",
          hourlyRate: data.hourlyRate,
          isActive: true,
          hasActivated: false,
          setupCode: generateSetupCode(),
          createdAt: new Date().toISOString(),
        },
      ])
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{PAGE_TITLES.team}</h1>
        <Button onClick={handleAddClick}>Add Employee</Button>
      </div>

      <EmployeeList employees={employees} onEdit={handleEditClick} />

      <EmployeeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initialEmployee={editingEmployee}
        onSave={handleSave}
      />
    </div>
  )
}
