import { useParams } from "react-router-dom"

import { ShiftList } from "@/components/shifts/ShiftList"
import { PAGE_TITLES } from "@/lib/messages"
import { currentUser, getEmployeeById } from "@/mocks/data"

// Shared page for /shifts (employee, own history) and /shifts/:userId
// (admin, selected employee) — architecture.md § Shared-page pattern.
export function ShiftHistoryPage() {
  const { userId: userIdParam } = useParams<{ userId: string }>()
  const targetUser = userIdParam ? getEmployeeById(Number(userIdParam)) : currentUser

  if (!targetUser) {
    return <p className="p-4 text-muted-foreground sm:p-6">Employee not found.</p>
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">{PAGE_TITLES.shiftHistory}</h1>
        {userIdParam && <p className="text-sm text-muted-foreground">{targetUser.name}</p>}
      </div>
      <ShiftList userId={targetUser.id} />
    </div>
  )
}
