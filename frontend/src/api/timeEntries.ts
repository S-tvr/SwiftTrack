import { request } from "./client"

/**
 * `TimeEntryResponseDto` — one shift with no cycle context, which is what the
 * write routes and `GET /time-entries/open` return.
 *
 * ⚠️ The list routes return a wider shape (`isSplit`, `canEdit`). That one
 * belongs to step 11 and is deliberately not declared here yet: this module
 * only owns what the Clock page calls.
 */
export interface TimeEntry {
  id: number
  userId: number
  /** UTC ISO-8601. */
  startTime: string
  /** UTC ISO-8601, or null while the shift is open. */
  endTime: string | null
  notes: string | null
}

/**
 * ⚠️ The entry is **wrapped**, and reading `data` instead of `data.openShift`
 * is the mistake this shape exists to make impossible to miss. Nest answers a
 * bare `null` with an empty body rather than the JSON literal `null`, so the
 * one endpoint whose normal answer is "nothing" would be the one that breaks
 * `res.json()`.
 */
export interface OpenShiftResponse {
  openShift: TimeEntry | null
}

/**
 * The Clock button's label is read from here and from nowhere else. It cannot
 * come from the shift list: a shift started in the *previous* cycle is filtered
 * out of the current one, so the button would offer "Clock In" to someone who
 * is already clocked in, and the clock-in would then fail.
 */
export function getOpenShift(): Promise<OpenShiftResponse> {
  return request<OpenShiftResponse>("/time-entries/open")
}

// ⚠️ Neither call sends a time. The server writes `startTime = now` and
// `endTime = now` itself, which is what makes clock in/out immune to a wrong
// device clock or a foreign timezone — nothing here touches lib/datetime.ts.

/** Fails with `OPEN_SHIFT_EXISTS` when a shift is already open. */
export function clockIn(): Promise<TimeEntry> {
  return request<TimeEntry>("/time-entries/clock-in", { method: "POST" })
}

/** Takes no id — it closes the caller's own open shift, and fails with
 *  `NO_OPEN_SHIFT` when there is none. */
export function clockOut(): Promise<TimeEntry> {
  return request<TimeEntry>("/time-entries/clock-out", { method: "PATCH" })
}
