import { request } from "./client"

/**
 * The four rate zones, as the backend names them. Hand-written here for the
 * same reason `ServerErrorCode` is: the two projects have separate tsconfigs,
 * and a workspace refactor is a bigger change than a list of four strings.
 *
 * ⚠️ Nothing in the UI may be keyed off this union alone. A fifth zone would
 * arrive as a string this type does not know, and the page still has to render
 * it — which is why the columns are generated from `zones[]` and the short
 * label falls back to the one the server sent (`zoneShortLabel` in messages.ts).
 */
export type PayZone = "DAY" | "EVENING" | "NIGHT" | "WEEKEND"

/**
 * One zone's line in the summary. Every figure is reproducible by hand:
 * `hours × rate`, rounded, is exactly `pay`.
 */
export interface PayrollZone {
  /** Stable key — also the key into `PayrollDay.hours`. */
  zone: PayZone
  /**
   * The user-facing name **including the surcharge** ("Evening +33%"), printed
   * verbatim. The client never composes a percentage of its own: a label that
   * stopped matching its factor would make the page misstate a wage.
   */
  label: string
  /** Hours in this zone across the cycle — an exact sum of the day cells. */
  hours: number
  /**
   * ISK per hour: `hourlyRate` × the zone factor, exact to the hundredth and
   * **never rounded**, here or on the server. An integer rate times 1.33 or
   * 1.45 always lands exactly on hundredths, so the rate shown is the rate
   * used — which is what lets a reader multiply this row and get the `pay`
   * beside it.
   */
  rate: number
  /** Whole ISK. The single point where money is rounded in the whole system. */
  pay: number
}

/** All four keys are always present, `0` where nothing was worked — so the day
 *  table renders a fixed grid and never handles a missing key. */
export type DayZoneHours = Record<PayZone, number>

/**
 * One row of the day-by-day table. A row is a **date, not a shift**: the zones
 * are defined by calendar day, so a night shift 22:00–06:00 appears as evening
 * hours on one date and night hours on the next.
 */
export interface PayrollDay {
  /**
   * A bare `YYYY-MM-DD`, UTC.
   *
   * ⚠️ Format it **as UTC** (`formatDate` in lib/datetime.ts). `new Date(
   * "2026-07-25")` read in a negative-offset browser prints the 24th, which
   * would put a Saturday's weekend hours on a row labelled Friday.
   */
  date: string
  hours: DayZoneHours
  /**
   * The row total, already computed.
   *
   * ⚠️ Render it **as sent**. Adding the four cells in JavaScript disagrees
   * with this figure in about a third of rows — measured on this project during
   * step 6 (`1.99 + 22.35 + 2.92` gives `27.259999999999998`). The integers
   * behind them sum exactly; their decimal representations do not.
   */
  totalHours: number
}

/**
 * Returned **identically** by `/payroll/me` and `/payroll/:userId`, so one
 * shared page serves both roles.
 *
 * Two views of the same hours: `zones` explains the money, `days` explains
 * where the hours came from. They cannot disagree — the zone totals are exact
 * sums of the day cells, which is also why the day table's Total row needs no
 * arithmetic: a column's total **is** `zones[].hours`, and the grand total
 * **is** `totalHours`.
 */
export interface PayrollResponse {
  /** e.g. "2026-07". Send it back untouched; never assemble one. */
  cycle: string
  prevCycle: string
  nextCycle: string
  /** First instant of the cycle, UTC ISO-8601. */
  cycleStart: string
  /** Last instant of the cycle, UTC ISO-8601. */
  cycleEnd: string
  userId: number
  /** For the heading on the admin's `/payroll/:userId`. Present on `/me` too,
   *  where it is the caller's own — one shape for both routes. */
  name: string
  /** Base ISK per hour, always a whole number. Not printed on its own: it is
   *  the `DAY` zone's rate, already in the summary. */
  hourlyRate: number
  /** Exact sum of every cell in `days`. Printed as sent. */
  totalHours: number
  /** Whole ISK — a plain sum of `zones[].pay`, never rounded a second time,
   *  which is what makes the Pay column add up to it exactly. */
  totalPay: number
  /**
   * A shift started inside this cycle and is still open. Open shifts are not
   * payable, so their day is missing from `days` entirely — this flag is the
   * only thing that can explain the gap instead of leaving it to read as a bug.
   */
  hasOpenShift: boolean
  /** Always four entries, in display order, zero-hour zones included. Rendered
   *  **as a list** — never as hardcoded rows or columns. */
  zones: PayrollZone[]
  /** Worked dates only, ascending. */
  days: PayrollDay[]
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

/** EMPLOYEE — the caller's own breakdown. The admin has no payroll of their
 *  own: they never clock in and carry no `hourlyRate`. */
export function getMyPayroll(cycle?: string): Promise<PayrollResponse> {
  return request<PayrollResponse>(`/payroll/me${cycleQuery(cycle)}`)
}

/** ADMIN — one employee's breakdown. A deactivated employee resolves normally
 *  (they still worked the hours); any id that is not an EMPLOYEE, the admin's
 *  own included, answers 404. */
export function getPayrollForUser(
  userId: number,
  cycle?: string,
): Promise<PayrollResponse> {
  return request<PayrollResponse>(`/payroll/${userId}${cycleQuery(cycle)}`)
}
