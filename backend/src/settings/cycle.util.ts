import { ErrorCode } from '../common/error-codes';
import { badRequest } from '../common/domain-errors';
import { CycleRangeDto } from './dto/cycle-range.dto';

/**
 * Pure pay-cycle arithmetic. No database, no DI, no injectable state — every
 * function here is deterministic in its arguments, so it can be unit-tested
 * standalone (cycle.util.spec.ts). `SettingsService` is the only thing that
 * reads AppSettings; it passes the day in and calls these.
 *
 * Everything is UTC. The app targets Iceland, which stays on UTC year-round.
 */

/**
 * A resolved cycle. `endExclusive` is the first instant *outside* the cycle —
 * midnight, which is simultaneously the next cycle's `start`. Adjacent cycles
 * therefore meet at exactly one instant, with no gap and no overlap, which is
 * what makes splitting a shift across the boundary exact.
 *
 * Every Prisma filter compares against it with `lt`, never `lte`. The
 * inclusive, human-readable end (`23:59:59.999`) exists only in CycleRangeDto,
 * for display.
 */
export interface CycleRange {
  start: Date;
  endExclusive: Date;
}

const CYCLE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `"2026-07"` → `{ year: 2026, month: 7 }`. `month` is 1-based, not a JS month index. */
export function parseCycleKey(cycle: string): { year: number; month: number } {
  if (!CYCLE_KEY_PATTERN.test(cycle)) {
    throw badRequest(
      ErrorCode.INVALID_CYCLE,
      `Invalid cycle "${cycle}". Expected format YYYY-MM.`,
    );
  }
  const [year, month] = cycle.split('-').map(Number);
  return { year, month };
}

/** `(2026, 7)` → `"2026-07"`. */
export function formatCycleKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * `"2026-07"` with a 25th boundary → `[25 Jul 00:00, 25 Aug 00:00)`.
 *
 * Only `cycleStartDay` is needed: `cycleEndDay` is always `cycleStartDay - 1`,
 * so the end is simply the same day of the following month. Reading it here
 * too would create a second source of truth for one boundary.
 *
 * `Date.UTC` takes a 0-based month index, so passing the 1-based `month`
 * unchanged lands on the *following* month — exactly where the exclusive end
 * belongs — and rolls the year over on its own for December.
 *
 * No day-of-month clamping: `cycleStartDay` is restricted to 11-25, and every
 * one of those days exists in every month, February included.
 */
export function computeCycleRange(
  cycle: string,
  cycleStartDay: number,
): CycleRange {
  const { year, month } = parseCycleKey(cycle);
  return {
    start: new Date(Date.UTC(year, month - 1, cycleStartDay)),
    endExclusive: new Date(Date.UTC(year, month, cycleStartDay)),
  };
}

/** `("2026-01", -1)` → `"2025-12"`. Feeds prevCycle/nextCycle for the ◀▶ navigator. */
export function shiftCycleKey(cycle: string, delta: number): string {
  const { year, month } = parseCycleKey(cycle);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return formatCycleKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1);
}

/**
 * The cycle containing `now` — the default when `?cycle=` is omitted.
 *
 * Deliberately not the current calendar month: on 3 August with a 25th
 * boundary the current cycle is `2026-07`, because `2026-08` runs 25 Aug -
 * 25 Sep and has not started yet. Returning it would show an employee an
 * empty page for work they have already done.
 */
export function resolveCurrentCycleKey(
  now: Date,
  cycleStartDay: number,
): string {
  const thisMonth = formatCycleKey(now.getUTCFullYear(), now.getUTCMonth() + 1);
  return now.getUTCDate() >= cycleStartDay
    ? thisMonth
    : shiftCycleKey(thisMonth, -1);
}

/*
 * `hoursWithinCycle()` used to live here. It is gone on purpose, not by
 * oversight: its only caller was `GET /time-entries`, which no longer reports
 * an hours figure at all. Under rate zones a single "hours" number per shift is
 * not the number anyone is paid for, so the shift list stopped carrying one and
 * this function lost its last consumer. Payroll does its own clipping in
 * `rate-zones.util.ts`, per (date × zone) rather than per shift.
 */

/**
 * Whether this shift extends beyond this cycle in either direction — it began
 * before the cycle opened, or ends after it closes.
 *
 * This is what the shift list marks as split, and it is the only thing that
 * explains the same shift showing up again when the ◀▶ navigator moves to the
 * neighbouring cycle. A shift ending exactly at `endExclusive` is not split: it
 * ends at the boundary, entirely inside.
 */
export function isSplitAcrossCycle(
  startTime: Date,
  endTime: Date | null,
  range: CycleRange,
): boolean {
  if (endTime === null) return false;
  return (
    startTime.getTime() < range.start.getTime() ||
    endTime.getTime() > range.endExclusive.getTime()
  );
}

/**
 * The cycle block every cycle-aware response carries. `cycleEnd` is the last
 * instant *inside* the cycle (`endExclusive - 1ms`) purely so the UI can print
 * "25 Jul - 24 Aug" without doing date arithmetic — it must never be fed back
 * into a query.
 */
export function toCycleRangeDto(
  cycle: string,
  range: CycleRange,
): CycleRangeDto {
  return {
    cycle,
    prevCycle: shiftCycleKey(cycle, -1),
    nextCycle: shiftCycleKey(cycle, 1),
    cycleStart: range.start.toISOString(),
    cycleEnd: new Date(range.endExclusive.getTime() - 1).toISOString(),
  };
}
