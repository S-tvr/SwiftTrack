// The only place a number is formatted for display, in the shape of
// `lib/datetime.ts` — which owns dates for the same reason: a second
// implementation of the same thing is how this codebase gets a bug nobody can
// see. Step 13 prints the same three kinds of figure on three more screens.
//
// ⚠️ Nothing here computes. Every function takes one number the server already
// decided and turns it into text. There is no addition, no rounding of a sum,
// and no second opinion about any figure — the payroll pipeline has **exactly
// three rounding points** (architecture.md § Invariants) and none of them is on
// this side of the wire.

/** Pinned rather than the browser's locale, exactly as in `datetime.ts`: the
 *  app is English-only, and a machine-dependent locale would make the same
 *  wage print differently on two screens. */
const LOCALE = "en-GB"

/**
 * Hours, always to 2 decimals — `5` prints as `5.00`.
 *
 * The trailing zeros are presentation of the *same* value, which is legitimate
 * because 2 decimals is the server's **canonical** unit: hours are rounded once
 * per cell (one date × one zone) and the rounded figure is what gets multiplied
 * by the rate. There is no more precise number hiding behind this one.
 *
 * ⚠️ The reverse — showing *fewer* decimals than were sent — would be a fourth
 * rounding point, in the browser, invisible and untested. `maximumFractionDigits`
 * is 2 rather than 0 or 1 for exactly that reason.
 */
const hoursFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * A zone's rate. Deliberately a **separate** formatter from `hoursFormatter`
 * even though the options match today: they are different quantities, and the
 * next person to change one must not silently change the other.
 *
 * ⚠️ Two fixed decimals, never fewer, and the reason was measured during step 6
 * rather than assumed. Printing `3,259` instead of `3,258.50` makes the row
 * **contradict itself** — `hours × rate` stops reproducing the `pay` beside it,
 * by ~3 ISK on a single line. Worse, the error is systematic: 0.5 ISK per
 * surcharged hour, always in the same direction for a given wage, ~50 ISK a
 * month. Showing the hundredths costs nothing: an integer ISK rate times 1.33
 * or 1.45 lands *exactly* on hundredths, so there is never a third decimal to
 * hide.
 */
const rateFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Money. Whole ISK with thousands separators — Icelandic króna has no
 * subunit, and nobody is ever paid a decimal krona.
 *
 * ⚠️ `maximumFractionDigits: 0` is **not** a rounding point here, and that is a
 * property of the contract rather than of this line: every pay amount the API
 * sends (`pay`, `totalPay`, `totalCost`) is an `Int`, computed in integer
 * centi-ISK and converted once on the way out. This formatter is never handed a
 * fraction, so it never rounds one away. No runtime guard for a value the API
 * cannot produce — the specs record the contract instead.
 */
const iskFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
})

/** "42.62", "5.00" — hours, as the server rounded them. */
export function formatHours(value: number): string {
  return hoursFormatter.format(value)
}

/** "3,258.50" — ISK per hour. A multiplier, not a payment. */
export function formatRate(value: number): string {
  return rateFormatter.format(value)
}

/** "129,060" — whole ISK. The unit itself is a label, and lives in
 *  `messages.ts` with every other string a user reads. */
export function formatIsk(value: number): string {
  return iskFormatter.format(value)
}

/**
 * English ordinal suffixes, selected by `Intl` rather than hand-rolled — the
 * naive "last digit" rule gets **11th, 12th and 13th** wrong, and 11 and 12 are
 * both inside the range this project actually uses (cycle days 10-25).
 */
const ORDINAL_SUFFIXES: Record<string, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
}

const ordinalRules = new Intl.PluralRules(LOCALE, { type: "ordinal" })

/**
 * A day of the month as an ordinal — `24` → `"24th"` (step 13-2).
 *
 * Used for the pay cycle's end day, which the Settings page states as a
 * sentence rather than offering as a second input. Like everything else in this
 * file it **computes nothing**: it is handed a day and returns its name.
 *
 * The fallback is unreachable for `en-GB` (its ordinal rules cover all four
 * categories) and exists so an unknown category can never render `undefined`
 * inside a sentence — the same defensive shape as `zoneShortLabel`.
 */
export function formatOrdinalDay(day: number): string {
  return `${day}${ORDINAL_SUFFIXES[ordinalRules.select(day)] ?? "th"}`
}
