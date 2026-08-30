// The only place in the app where a date or time is formatted or parsed.
// No component calls `new Date`, `toLocaleString` or `toLocaleDateString`
// (architecture.md § Frontend invariants).
//
// Everything renders in UTC, deliberately: the backend computes cycles and rate
// zones in UTC end to end because the app targets Iceland, which stays on UTC
// all year. A browser elsewhere must still see the same wall clock the payroll
// was calculated against.

/** Pinned rather than the browser's locale: the app is English-only, and a
 *  machine-dependent locale would make the same shift print differently on two
 *  screens. */
const LOCALE = "en-GB"

const UTC = { timeZone: "UTC" } as const

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  ...UTC,
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  ...UTC,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  ...UTC,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/**
 * Converts a `<input type="datetime-local">` value to the ISO instant the API
 * expects, by **appending the UTC marker** — the value is read as already being
 * Iceland time, which is what the form tells the user to enter.
 *
 * ⚠️ Never `new Date(value).toISOString()`. That reads the value as the
 * *browser's* local time and shifts it by the developer's offset, which moves
 * the shift into a different rate zone and changes someone's pay. It compiles,
 * it looks right, and no backend test can see it.
 *
 * Browsers emit either `2026-08-25T14:30` or `2026-08-25T14:30:00` depending on
 * the input's `step`, so both are accepted.
 */
export function toIsoUtc(localValue: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(
    localValue,
  )
  if (!match) {
    throw new Error(`Not a datetime-local value: "${localValue}"`)
  }
  const [, date, hoursMinutes, seconds = "00"] = match
  return `${date}T${hoursMinutes}:${seconds}.000Z`
}

const dayTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  ...UTC,
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/**
 * "Thu 07-May 11:05" — the shift list's Start and End cells.
 *
 * Assembled from `formatToParts` rather than a format string: the locale's own
 * pattern is "Thu 07 May, 11:05", and the separators are what differ. Doing it
 * this way keeps Intl in charge of the UTC conversion and the weekday/month
 * names while pinning the punctuation.
 *
 * ⚠️ Deliberately carries **no year**, and that is safe rather than sloppy: a
 * cycle spans about thirty days, so two rows can never share a day and month
 * while belonging to different years. The years live in the cycle header above.
 *
 * The weekday is the point of the format. Rate zones are decided by it —
 * Saturday and Sunday are paid at +45% all day — so a reader checking their
 * payroll against this list needs to see which shifts were weekend shifts
 * without counting dates.
 */
export function formatDayTime(iso: string): string {
  const parts = dayTimeFormatter.formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ""

  return `${part("weekday")} ${part("day")}-${part("month")} ${part("hour")}:${part("minute")}`
}

/**
 * Now, in the same UTC ISO-8601 format the API uses. Here rather than inline in
 * a component so that `new Date` stays inside this module — and so that the
 * comparison it feeds is a **string** comparison against another instant of
 * identical format, which is exact and needs no date arithmetic.
 */
export function nowIsoUtc(): string {
  return new Date().toISOString()
}

/**
 * The inverse of `toIsoUtc`: an API instant back into a `datetime-local` value,
 * for prefilling the edit form.
 *
 * ⚠️ Implemented as a **string slice**, not through `Date`. The API always sends
 * UTC (`2026-08-04T08:00:00.000Z`), and the input must show those same wall-clock
 * digits — so anything that routes through the browser's local zone would open
 * the edit form on a different time than the one being edited, and saving it
 * unchanged would silently move the shift. `toIsoUtc(toDatetimeLocal(x)) === x`
 * for every instant the API produces.
 */
export function toDatetimeLocal(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(iso)
  if (!match) throw new Error(`Not an ISO instant: "${iso}"`)
  return match[1]
}

/** "25 Aug 2026, 14:30" — an instant from the API. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso))
}

/** "14:30" — an instant from the API. */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso))
}

/**
 * "25 Aug 2026". Takes either a full instant or the bare `YYYY-MM-DD` the
 * payroll day table sends.
 *
 * ⚠️ The bare form is why this function exists: `new Date("2026-07-25")` is
 * parsed as UTC midnight, so a browser at a negative offset formatting it
 * locally prints the **24th** — which would move a Saturday's weekend hours
 * onto a row labelled Friday.
 */
export function formatDate(value: string): string {
  return dateFormatter.format(new Date(value))
}

// ── The timezone notice ──────────────────────────────────────────────────────

/** The browser's own zone name, e.g. "Europe/Athens". Never derived from IP:
 *  the right question is "does your clock differ from UTC", and one IP needs
 *  two different answers in Athens depending on the month. */
export function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Minutes the browser is **ahead of** UTC. Positive is ahead, negative behind.
 * `getTimezoneOffset()` is inverted from how anyone says it out loud (Athens in
 * August reports -180), so the sign is flipped here once instead of at each
 * call site.
 */
export function getUtcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset()
}

/**
 * "3 hours ahead", "5 hours 30 minutes behind", "45 minutes ahead".
 *
 * ⚠️ Offsets are not always whole hours (India +5:30, Nepal +5:45), so minutes
 * are formatted rather than divided away.
 */
export function formatUtcOffsetDifference(offsetMinutes: number): string {
  const total = Math.abs(offsetMinutes)
  if (total === 0) return "on UTC"

  const hours = Math.floor(total / 60)
  const minutes = total % 60

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`)
  }

  return `${parts.join(" ")} ${offsetMinutes > 0 ? "ahead" : "behind"}`
}
