import { request } from "./client"

/**
 * `TimeEntryResponseDto` — one shift with no cycle context, which is what the
 * write routes and `GET /time-entries/open` return.
 *
 * The list routes return `CycleTimeEntry` below, which adds the two
 * cycle-relative fields the backend computes and the client may not.
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

// ── The shift list (step 11) ─────────────────────────────────────────────────

/**
 * One row of the list, with the two facts the client is **forbidden to derive**
 * because both need cycle boundaries resolved (architecture.md § Invariants).
 */
export interface CycleTimeEntry extends TimeEntry {
  /**
   * The shift extends beyond this cycle, so the same row also appears in the
   * neighbouring one. It is what explains the duplicate to the reader — and the
   * reason the list must never print a duration: the row carries its **full**
   * start and end in both cycles, so a computed length would count it twice.
   */
  isSplit: boolean
  /**
   * Whether **the caller** may still edit *or delete* this row — one flag, two
   * buttons. Anchored on `startTime`, so a split shift that began in a closed
   * cycle stays locked. Always `true` for an ADMIN.
   *
   * ⚠️ Cycle lock only. It deliberately says nothing about the open-shift
   * block, which is transient and answers with its own `OPEN_SHIFT_EXISTS`.
   */
  canEdit: boolean
}

/**
 * The shape returned by **both** list routes, identical on purpose so the
 * shared `ShiftList` and `CycleNavigator` consume either without branching.
 *
 * The first five fields are the cycle block, echoed back verbatim by the
 * navigator — the client computes no boundary and no month rollover. The next
 * three are facts about *whose* list this is and what the caller may do with
 * it, and are siblings of `entries` rather than members of the block.
 */
export interface CycleEntriesResponse {
  /** e.g. "2026-07". Send it back untouched; never assemble one. */
  cycle: string
  prevCycle: string
  nextCycle: string
  /** First instant of the cycle, UTC ISO-8601. */
  cycleStart: string
  /** Last instant of the cycle, UTC ISO-8601. */
  cycleEnd: string
  /** Whose shifts these are (step 8d). */
  userId: number
  /**
   * The name behind `userId` (step 8d), for the page heading on the admin's
   * `/shifts/:userId`. Returned on `/me` too, where it is the caller's own name
   * and the employee page has no use for it — one shape for both routes.
   */
  name: string
  /**
   * Whether the caller may create a shift in this cycle at all. A `POST` has no
   * row to carry a per-entry flag, which is why this one exists separately.
   * Always `true` for an ADMIN.
   */
  canWrite: boolean
  entries: CycleTimeEntry[]
}

/**
 * `?cycle=` is **omitted entirely** on first load, never guessed: the backend
 * resolves "the cycle containing now", which is not the current calendar month.
 */
function cycleQuery(cycle: string | undefined, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra)
  if (cycle !== undefined) params.set("cycle", cycle)
  const query = params.toString()
  return query === "" ? "" : `?${query}`
}

/** EMPLOYEE — the caller's own history. */
export function getMyEntries(cycle?: string): Promise<CycleEntriesResponse> {
  return request<CycleEntriesResponse>(`/time-entries/me${cycleQuery(cycle)}`)
}

/** ADMIN — one employee's history. A non-employee id answers 404, not an
 *  empty list. */
export function getEntriesForUser(
  userId: number,
  cycle?: string,
): Promise<CycleEntriesResponse> {
  return request<CycleEntriesResponse>(
    `/time-entries${cycleQuery(cycle, { userId: String(userId) })}`,
  )
}

/**
 * What `ShiftForm` submits. Times are UTC ISO-8601 built by `toIsoUtc()` — a
 * `datetime-local` value with `":00.000Z"` appended, never `new Date(value)`.
 *
 * ⚠️ `notes` is **always sent**, `null` included. `PUT` is a full replacement
 * and the service writes `notes ?? null`, so omitting the field on an edit
 * silently erases whatever was there. A backend e2e test asserts exactly that;
 * do not "optimise" the form into sending only what changed.
 */
export interface TimeEntryInput {
  startTime: string
  /**
   * Required. The manual form is the tool for *closed* shifts — clock-in owns
   * live ones, which keeps "at most one open shift" enforced in one place.
   */
  endTime: string
  notes: string | null
}

/**
 * Owner or ADMIN.
 *
 * ⚠️ `userId` is **required when an ADMIN submits** and **rejected when an
 * EMPLOYEE does**. Without it on the admin's `/shifts/:userId` the shift is
 * written to the *admin's own* account — which has no `hourlyRate`, appears in
 * no list and would never be paid. This is assignment at creation, which `PUT`
 * deliberately forbids.
 */
export function createEntry(
  input: TimeEntryInput & { userId?: number },
): Promise<TimeEntry> {
  return request<TimeEntry>("/time-entries", { method: "POST", body: input })
}

/** Owner or ADMIN. Takes no `userId` — that would *move* a shift between
 *  people, which is a different act from creating one. */
export function updateEntry(
  id: number,
  input: TimeEntryInput,
): Promise<TimeEntry> {
  return request<TimeEntry>(`/time-entries/${id}`, {
    method: "PUT",
    body: input,
  })
}

/** Owner or ADMIN. Permanent — there is no soft delete for a time entry.
 *  Answers `204`, which the client wrapper reads as an empty body. */
export function deleteEntry(id: number): Promise<void> {
  return request<void>(`/time-entries/${id}`, { method: "DELETE" })
}
