import { request } from "./client"

/**
 * `SettingsResponseDto` — the single `AppSettings` row (`id = 1`), which is the
 * whole of this module's surface.
 *
 * ⚠️ `cycleEndDay` is **derived, not independent**: the backend validates it as
 * exactly `cycleStartDay - 1` (`@IsDayBefore`) and its cycle arithmetic reads
 * only `cycleStartDay`, so the two can never disagree about where a boundary
 * is. It is carried here because `PUT` requires it, not because anything reads
 * it to compute with.
 */
export interface Settings {
  /** Day of the month a cycle starts. 11-25, enforced by the DTO. */
  cycleStartDay: number
  /** Day of the *following* month a cycle ends. Always `cycleStartDay - 1`. */
  cycleEndDay: number
}

/**
 * The end day, from the start day. **The single implementation of this rule on
 * the client**, and it is here rather than in the page because it is a fact
 * about the API contract: `PUT` requires both fields and `@IsDayBefore` rejects
 * any other pair.
 *
 * ⚠️ It existed three times in the first draft of the Settings page — once for
 * the sentence under the select, once for the request body, once for the
 * confirmation dialog. That is the failure mode this codebase is organised
 * against: three copies of one rule, and a change to one of them makes the page
 * *say* one day and *send* another, with nothing to catch the disagreement.
 *
 * This is not the client-side cycle arithmetic the invariants forbid — it
 * resolves no boundary and produces no date. The backend's own arithmetic reads
 * only `cycleStartDay`, so the stored pair can never disagree with itself.
 */
export function deriveCycleEndDay(cycleStartDay: number): number {
  return cycleStartDay - 1
}

export function getSettings(): Promise<Settings> {
  return request<Settings>("/settings")
}

/**
 * A **full replacement** of the two-field object — `UpdateSettingsDto` marks
 * both as required, so this is deliberately not a partial. The same shape goes
 * out as comes back, which is why one interface serves both directions here.
 */
export function updateSettings(settings: Settings): Promise<Settings> {
  return request<Settings>("/settings", { method: "PUT", body: settings })
}
