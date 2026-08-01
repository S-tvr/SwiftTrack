// Static mock data for Step 0 (UI mockups only). Shapes mirror the domain
// model in swifttrack-phase1-final.md §3 — no fetch calls, nothing here talks
// to a real backend. Replaced by frontend/src/api/ calls from step 9 onward.

export type Role = "ADMIN" | "EMPLOYEE"

export interface MockUser {
  id: number
  name: string
  email: string
  role: Role
  hourlyRate: number | null // ISK, integer — EMPLOYEE only
  isActive: boolean
  hasActivated: boolean // derived: password !== null
  setupCode: string | null // 4-digit, admin hands this to the employee manually
  createdAt: string // ISO, UTC
}

export interface MockTimeEntry {
  id: number
  userId: number
  startTime: string // ISO, UTC
  endTime: string | null // null while the shift is open
  notes: string | null
}

export interface MockSettings {
  cycleStartDay: number
  cycleEndDay: number
}

// Flip this to true to preview the admin-facing pages/components — the
// mockup has no real auth yet, so this constant stands in for AuthContext
// until step 9. Typed `as boolean` so TS doesn't narrow it to a single
// literal and flag the ADMIN branch below as unreachable.
const VIEW_AS_ADMIN = true as boolean
export const MOCK_VIEW_AS: Role = VIEW_AS_ADMIN ? "ADMIN" : "EMPLOYEE"

export const mockAdmin: MockUser = {
  id: 1,
  name: "Björg Anna",
  email: "bjorg@swifttrack.is",
  role: "ADMIN",
  hourlyRate: null,
  isActive: true,
  hasActivated: true,
  setupCode: null,
  createdAt: "2026-01-05T09:00:00.000Z",
}

export const mockEmployees: MockUser[] = [
  {
    id: 2,
    name: "Jón Gunnarsson",
    email: "jon@swifttrack.is",
    role: "EMPLOYEE",
    hourlyRate: 3200,
    isActive: true,
    hasActivated: true,
    setupCode: null, // cleared on activation
    createdAt: "2026-02-10T09:00:00.000Z",
  },
  {
    id: 3,
    name: "Katrín Ólafsdóttir",
    email: "katrin@swifttrack.is",
    role: "EMPLOYEE",
    hourlyRate: 3400,
    isActive: true,
    hasActivated: true,
    setupCode: null,
    createdAt: "2026-03-01T09:00:00.000Z",
  },
  {
    id: 4,
    name: "Einar Þór",
    email: "einar@swifttrack.is",
    role: "EMPLOYEE",
    hourlyRate: 3000,
    isActive: true,
    hasActivated: false, // still Pending — hasn't used the setupCode yet
    setupCode: "7391",
    createdAt: "2026-07-28T09:00:00.000Z",
  },
]

export const currentUser: MockUser = VIEW_AS_ADMIN ? mockAdmin : mockEmployees[0]

// Resolved cycle boundaries — in the real app the backend is the single
// source of truth for these (architecture.md § Invariants); the mockup just
// hardcodes one plausible cycle to render against.
export const currentCycle = {
  cycleStart: "2026-06-25T00:00:00.000Z",
  cycleEnd: "2026-07-24T23:59:59.000Z",
}

export const mockSettings: MockSettings = {
  cycleStartDay: 25,
  cycleEndDay: 24,
}

// Time entries for mockEmployees[0] (Jón), within currentCycle.
export const mockTimeEntries: MockTimeEntry[] = [
  {
    id: 101,
    userId: 2,
    startTime: "2026-06-26T08:00:00.000Z",
    endTime: "2026-06-26T16:30:00.000Z",
    notes: null,
  },
  {
    id: 102,
    userId: 2,
    startTime: "2026-06-29T08:00:00.000Z",
    endTime: "2026-06-29T17:00:00.000Z",
    notes: "Covered closing shift",
  },
  {
    id: 103,
    userId: 2,
    startTime: "2026-07-03T08:00:00.000Z",
    endTime: "2026-07-03T16:00:00.000Z",
    notes: null,
  },
  {
    id: 104,
    userId: 2,
    startTime: "2026-07-08T08:00:00.000Z",
    endTime: null, // open shift — forgotten clock out
    notes: null,
  },
]

export function getEmployeeById(id: number): MockUser | undefined {
  return mockEmployees.find((employee) => employee.id === id)
}

export function getTimeEntriesForUser(userId: number): MockTimeEntry[] {
  return mockTimeEntries.filter((entry) => entry.userId === userId)
}

// Mock-only stand-in for the ◀▶ CycleNavigator demo: shifts currentCycle by
// whole months. The real cycle math (resolveCycleRange) lives only in the
// backend's PayrollService (architecture.md § Invariants) — this exists
// purely so the mockup has something to page through, and is replaced by
// the backend-supplied cycleStart/cycleEnd from step 11 onward.
export function getMockCycle(monthOffset: number) {
  const start = new Date(currentCycle.cycleStart)
  const end = new Date(currentCycle.cycleEnd)
  start.setUTCMonth(start.getUTCMonth() + monthOffset)
  end.setUTCMonth(end.getUTCMonth() + monthOffset)
  return { cycleStart: start.toISOString(), cycleEnd: end.toISOString() }
}

export function isWithinCycle(
  entry: MockTimeEntry,
  cycleStart: string,
  cycleEnd: string
): boolean {
  const startTime = new Date(entry.startTime).getTime()
  return startTime >= new Date(cycleStart).getTime() && startTime <= new Date(cycleEnd).getTime()
}

export function hoursBetween(startTime: string, endTime: string): number {
  return (new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60 * 60)
}
