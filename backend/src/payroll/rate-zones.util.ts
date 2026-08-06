import type { CycleRange } from '../settings/cycle.util';

/**
 * Pure pay-zone arithmetic. No database, no DI, no injectable state — the same
 * shape as `cycle.util.ts`, and unit-tested standalone (rate-zones.util.spec.ts).
 *
 * Everything is UTC. The app targets Iceland, which stays on UTC year-round, so
 * "17:00" and "Saturday" are unambiguous and no timezone conversion exists.
 *
 * ── Why every number here is an integer ──────────────────────────────────────
 * Nothing in this file is computed in decimal floats. Hours are held as
 * hundredths of an hour ("centihours") and money as hundredths of a króna
 * ("centi-ISK"), because `2450 * 1.33` in IEEE doubles is not exactly 3258.5,
 * and a payroll figure must not depend on which way that lands. Conversion to
 * a decimal number happens once, on the way out (`centiToNumber`).
 *
 * This file is the **only** place hours are rounded, because payroll is the
 * only thing that reports hours: `GET /time-entries` deliberately carries no
 * hours figure at all (see CycleTimeEntryDto).
 *
 * ── Where rounding happens, and nowhere else ─────────────────────────────────
 *  1. Hours → rounded to 2 decimals per **cell** (one date × one zone), the
 *     finest unit that is ever displayed. Every hour total above a cell is an
 *     exact sum of cells, so the column always adds up to the figure below it.
 *  2. Zone rate → never rounded. An integer ISK rate times 133 or 145
 *     hundredths lands exactly on hundredths, so the displayed rate IS the
 *     rate used.
 *  3. Zone pay → rounded to whole ISK. This is the ONLY money rounding in the
 *     system; `totalPay` and `totalCost` are plain sums of integers.
 */

export enum PayZone {
  DAY = 'DAY',
  EVENING = 'EVENING',
  NIGHT = 'NIGHT',
  WEEKEND = 'WEEKEND',
}

interface ZoneDefinition {
  zone: PayZone;
  /** User-facing label, spec §8a — carries the surcharge so the client prints it verbatim. */
  label: string;
  /** Hundredths of the base rate: 100 = no surcharge, 133 = +33%, 145 = +45%. */
  rateFactorHundredths: number;
}

/**
 * The four zones, in display order. NIGHT and WEEKEND share a factor but stay
 * separate on purpose: a client can always merge two rows, never split one.
 *
 * These are hardcoded rather than stored in AppSettings deliberately — payroll
 * is computed on the fly and never frozen, so an editable percentage would
 * silently rewrite every past cycle. Changing one is a developer action.
 */
export const PAY_ZONES: readonly ZoneDefinition[] = [
  { zone: PayZone.DAY, label: 'Day', rateFactorHundredths: 100 },
  { zone: PayZone.EVENING, label: 'Evening +33%', rateFactorHundredths: 133 },
  { zone: PayZone.NIGHT, label: 'Night +45%', rateFactorHundredths: 145 },
  { zone: PayZone.WEEKEND, label: 'Weekend +45%', rateFactorHundredths: 145 },
];

/** Mon-Fri 00:00-08:00 is NIGHT; 08:00-17:00 is DAY; 17:00-24:00 is EVENING. */
const DAY_ZONE_START_HOUR = 8;
const EVENING_ZONE_START_HOUR = 17;
const HOURS_PER_DAY = 24;

const MS_PER_HOUR = 3_600_000;
/** One hundredth of an hour = 36 seconds. */
const MS_PER_CENTIHOUR = 36_000;
const HUNDREDTHS = 100;

/** Hours of one zone on one date, as hundredths of an hour. */
export interface DayZoneHours {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  /** All four zones always present, so the client never handles a missing key. */
  centiHours: Record<PayZone, number>;
  totalCentiHours: number;
}

interface DayZoneSegment {
  date: string;
  zone: PayZone;
  ms: number;
}

function zoneDefinition(zone: PayZone): ZoneDefinition {
  const definition = PAY_ZONES.find((candidate) => candidate.zone === zone);
  if (!definition) {
    // Unreachable while PayZone and PAY_ZONES agree; thrown rather than
    // returned as undefined so a future zone added to one and not the other
    // fails loudly instead of silently paying nothing.
    throw new Error(`No rate zone definition for "${zone}".`);
  }
  return definition;
}

/** Which zone an instant falls in. Weekend wins the whole day; no zone ever overlaps another. */
export function resolveZone(instant: Date): PayZone {
  const dayOfWeek = instant.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return PayZone.WEEKEND;

  const hour = instant.getUTCHours();
  if (hour < DAY_ZONE_START_HOUR) return PayZone.NIGHT;
  if (hour < EVENING_ZONE_START_HOUR) return PayZone.DAY;
  return PayZone.EVENING;
}

/**
 * The first zone boundary strictly after `instant`: 08:00, 17:00 or the
 * following midnight.
 *
 * Weekend days are cut at 08:00/17:00 too, even though the zone does not change
 * across them — the resulting adjacent segments carry the same zone and merge
 * in the accumulator, which costs nothing and keeps this free of a weekday
 * branch that would have to stay in step with `resolveZone`.
 */
function nextZoneBoundary(instant: Date): number {
  const dayStart = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
  );
  const time = instant.getTime();

  for (const hour of [
    DAY_ZONE_START_HOUR,
    EVENING_ZONE_START_HOUR,
    HOURS_PER_DAY,
  ]) {
    const candidate = dayStart + hour * MS_PER_HOUR;
    if (candidate > time) return candidate;
  }
  // Unreachable: midnight of the following day is always after any instant
  // belonging to this one.
  return dayStart + HOURS_PER_DAY * MS_PER_HOUR;
}

/**
 * One shift, clipped to the cycle and cut into (date, zone) pieces.
 *
 * Cutting at midnight is not an extra step taken for the day-by-day table — the
 * zones are defined by calendar day (weekday vs weekend, hour of day), so the
 * calculation has to cut there anyway to know which zone applies. The table
 * rows fall out of the arithmetic that already had to happen.
 *
 * An open shift has no end to clip against and contributes nothing — it is not
 * payable until someone closes it.
 */
export function splitShiftIntoDayZoneSegments(
  startTime: Date,
  endTime: Date | null,
  range: CycleRange,
): DayZoneSegment[] {
  if (endTime === null) return [];

  const end = Math.min(endTime.getTime(), range.endExclusive.getTime());
  let cursor = Math.max(startTime.getTime(), range.start.getTime());

  const segments: DayZoneSegment[] = [];
  // A shift entirely outside the cycle, and a zero-length one, both leave this
  // loop untouched and yield no segments at all.
  while (cursor < end) {
    const at = new Date(cursor);
    const boundary = Math.min(nextZoneBoundary(at), end);
    segments.push({
      date: at.toISOString().slice(0, 10),
      zone: resolveZone(at),
      ms: boundary - cursor,
    });
    cursor = boundary;
  }
  return segments;
}

/**
 * Every shift of one person, turned into the day-by-day grid the payroll
 * breakdown renders.
 *
 * Rounding happens here and only here for hours: milliseconds are accumulated
 * across ALL shifts first, then each cell is rounded once. Rounding per shift
 * instead would let two short shifts on the same day each lose 18 seconds.
 */
export function buildDayZoneHours(
  shifts: readonly { startTime: Date; endTime: Date | null }[],
  range: CycleRange,
): DayZoneHours[] {
  const msByDate = new Map<string, Record<PayZone, number>>();

  for (const shift of shifts) {
    const segments = splitShiftIntoDayZoneSegments(
      shift.startTime,
      shift.endTime,
      range,
    );
    for (const segment of segments) {
      let row = msByDate.get(segment.date);
      if (!row) {
        row = emptyZoneRecord();
        msByDate.set(segment.date, row);
      }
      row[segment.zone] += segment.ms;
    }
  }

  return (
    [...msByDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, ms]) => {
        const centiHours = emptyZoneRecord();
        let totalCentiHours = 0;
        for (const { zone } of PAY_ZONES) {
          centiHours[zone] = msToCentiHours(ms[zone]);
          totalCentiHours += centiHours[zone];
        }
        return { date, centiHours, totalCentiHours };
      })
      // A shift shorter than 18 seconds rounds to nothing; without this it would
      // print a row of zeroes on a day the employee effectively did not work.
      .filter((day) => day.totalCentiHours > 0)
  );
}

/** Zone totals for the whole cycle — an exact sum of the cells above, never a re-computation. */
export function sumZoneCentiHours(
  days: readonly DayZoneHours[],
): Record<PayZone, number> {
  const totals = emptyZoneRecord();
  for (const day of days) {
    for (const { zone } of PAY_ZONES) {
      totals[zone] += day.centiHours[zone];
    }
  }
  return totals;
}

/**
 * A zone's rate in centi-ISK per hour. Exact by construction: `hourlyRate` is a
 * whole number of ISK and the factor is a whole number of hundredths, so the
 * product is a whole number of hundredths — never a third decimal, and never
 * rounded. This is why the Rate column can be shown and still reproduce the
 * Pay column exactly.
 */
export function zoneRateCentiIsk(hourlyRate: number, zone: PayZone): number {
  return hourlyRate * zoneDefinition(zone).rateFactorHundredths;
}

/**
 * A zone's pay in whole ISK — the single point where money is rounded.
 *
 * `centiHours/100` hours × `rateCentiIsk/100` ISK = `product / 10_000` ISK.
 * Both factors are integers, so the product is exact, and the half-up step is
 * integer arithmetic too: no float ever decides which way a króna falls.
 */
export function zonePayIsk(centiHours: number, rateCentiIsk: number): number {
  const product = centiHours * rateCentiIsk;
  return Math.floor((product + 5_000) / 10_000);
}

/** Hundredths → the decimal number that goes on the wire (874 → 8.74). */
export function centiToNumber(centi: number): number {
  return centi / HUNDREDTHS;
}

/** Half-up on integers, for the same reason `zonePayIsk` avoids floats. */
function msToCentiHours(ms: number): number {
  return Math.floor((ms + MS_PER_CENTIHOUR / 2) / MS_PER_CENTIHOUR);
}

function emptyZoneRecord(): Record<PayZone, number> {
  return {
    [PayZone.DAY]: 0,
    [PayZone.EVENING]: 0,
    [PayZone.NIGHT]: 0,
    [PayZone.WEEKEND]: 0,
  };
}
