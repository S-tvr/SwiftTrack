import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsResponseDto } from './dto/settings-response.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CycleRangeDto } from './dto/cycle-range.dto';
import {
  computeCycleRange,
  resolveCurrentCycleKey,
  shiftCycleKey,
  toCycleRangeDto,
  type CycleRange,
} from './cycle.util';
import type { AppSettings } from '../generated/prisma/client';

const SETTINGS_ROW_ID = 1;
const MIN_CYCLE_START_DAY = 11;
const MAX_CYCLE_START_DAY = 25;

/**
 * What every cycle-aware caller needs: `range` to filter and clip with,
 * `cycleDto` to spread into the response, and `writableFrom` for callers that
 * also have to say whether the caller may still write here.
 *
 * `writableFrom` rides along rather than being fetched separately because it is
 * derived from the **same** `cycleStartDay` as the range: computing it here is
 * two `Date.UTC` calls on a value already in hand, while asking for it
 * afterwards means reading the singleton row a second time in one request — and
 * a second read is not merely wasteful, it can disagree with the first if a
 * `PUT /settings` lands between them, leaving one response describing a cycle
 * from one boundary and a write window from another.
 */
export interface ResolvedCycle {
  range: CycleRange;
  cycleDto: CycleRangeDto;
  writableFrom: Date;
  /**
   * Whether this cycle has opened yet. A fact about the *cycle*, so it is
   * answered here rather than by whoever asked: the caller would have to read
   * the clock to work it out, and consulting the clock about a cycle boundary
   * is the one thing every consumer of this service is forbidden to do.
   *
   * It exists because a cycle can be unwritable in **two** directions. Rule 5
   * closes the past; rule 4 ("no timestamp after now") closes the future — the
   * ◀▶ navigator can reach a cycle that has not begun, and "Add Shift" has to
   * be disabled there too.
   */
  hasStarted: boolean;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SettingsResponseDto> {
    return this.toResponseDto(await this.getSettingsRow());
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<SettingsResponseDto> {
    // Checked first so a missing row reports the actionable message below
    // rather than surfacing Prisma's P2025 as an opaque 500.
    await this.getSettingsRow();

    const settings = await this.prisma.appSettings.update({
      where: { id: SETTINGS_ROW_ID },
      data: {
        cycleStartDay: dto.cycleStartDay,
        cycleEndDay: dto.cycleEndDay,
      },
    });
    return this.toResponseDto(settings);
  }

  /**
   * The single entry point for pay-cycle boundaries. `TimeEntriesService` and
   * `PayrollService` call this instead of doing date arithmetic of their own —
   * the same way `AuthService` goes through `UsersService` for every User query.
   *
   * `cycle` omitted means "the cycle containing now", resolved here rather than
   * by each caller: the rule needs `cycleStartDay`, so every caller would
   * otherwise need its own read of this row and its own copy of the comparison.
   */
  async resolveCycleRange(cycle?: string): Promise<ResolvedCycle> {
    const { cycleStartDay } = await this.getSettingsRow();
    this.assertUsableCycleStartDay(cycleStartDay);

    // One reading of the clock for the whole resolution. Three facts below
    // depend on "now" — which cycle is current, where the write window opens,
    // and whether the requested cycle has begun — and they are only guaranteed
    // to agree with each other if they are answered from the same instant.
    const now = new Date();

    const resolvedCycle = cycle ?? resolveCurrentCycleKey(now, cycleStartDay);
    const range = computeCycleRange(resolvedCycle, cycleStartDay);

    return {
      range,
      cycleDto: toCycleRangeDto(resolvedCycle, range),
      writableFrom: this.computeWritableFrom(cycleStartDay, now),
      hasStarted: range.start.getTime() <= now.getTime(),
    };
  }

  /**
   * The earliest instant an EMPLOYEE may still write to — the start of the
   * *previous* cycle (spec §7a rule 5). Anything before it belongs to a cycle
   * that has been paid, and its record should stop moving.
   *
   * Only a lower bound is returned, and that is not an omission: rule 4 already
   * refuses any timestamp after `now`, so the upper end of the window needs no
   * second guard here.
   *
   * It lives in this service for the same reason `resolveCycleRange()` does —
   * the boundary is derived from `AppSettings`, and `TimeEntriesService` is not
   * allowed to do cycle arithmetic of its own. An ADMIN never reaches this: they
   * have no cycle limit, being the only actor who can repair a genuine
   * historical error.
   *
   * Kept as its own entry point for the **write** paths, which have no cycle to
   * resolve and so never call `resolveCycleRange()`. The read paths take
   * `writableFrom` off that call instead — same arithmetic, one row read.
   */
  async resolveWritableCycleStart(): Promise<Date> {
    const { cycleStartDay } = await this.getSettingsRow();
    this.assertUsableCycleStartDay(cycleStartDay);

    return this.computeWritableFrom(cycleStartDay, new Date());
  }

  /**
   * The instant a rate entered *now* starts applying — the start of the **next**
   * cycle. Used by `UsersService` when an admin changes an employee's rate.
   *
   * The mirror image of `resolveWritableCycleStart()` above: that one looks one
   * cycle back to decide what may still be edited, this one looks one cycle
   * forward to decide what a raise may touch. Neither is allowed to live in its
   * caller — `UsersService` owns `User`, not cycle boundaries, and a second copy
   * of this arithmetic is how the write window and the rate window would come to
   * disagree about where a cycle begins.
   *
   * Anchoring at the *next* cycle rather than at `now` is what makes a raise
   * forward-effective: the cycle in progress has already been priced at the old
   * rate, and a rate landing mid-cycle would either reprice it (the bug this
   * table exists to prevent) or split it in two (see spec §4, decision 5g —
   * rejected, it adds a fourth rounding point).
   */
  async resolveRateEffectiveFrom(): Promise<Date> {
    const { cycleStartDay } = await this.getSettingsRow();
    this.assertUsableCycleStartDay(cycleStartDay);

    const nextCycle = shiftCycleKey(
      resolveCurrentCycleKey(new Date(), cycleStartDay),
      1,
    );
    return computeCycleRange(nextCycle, cycleStartDay).start;
  }

  /**
   * The shared arithmetic, so the two entry points cannot drift apart. `now` is
   * passed in rather than read here, so a single resolution never consults the
   * clock twice.
   */
  private computeWritableFrom(cycleStartDay: number, now: Date): Date {
    const currentCycle = resolveCurrentCycleKey(now, cycleStartDay);
    const previousCycle = shiftCycleKey(currentCycle, -1);
    return computeCycleRange(previousCycle, cycleStartDay).start;
  }

  /**
   * The singleton row is created by the seed script and guarded by a DB-level
   * `CHECK (id = 1)`, so it is missing only if migrations ran without the seed.
   * That fails loudly here rather than falling back to schema defaults: a
   * silent fallback would move every payroll boundary by up to two weeks with
   * nothing on screen to say so.
   */
  private async getSettingsRow(): Promise<AppSettings> {
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: SETTINGS_ROW_ID },
    });
    if (!settings) {
      throw new InternalServerErrorException(
        'Settings not initialised. Run `npx prisma db seed`.',
      );
    }
    return settings;
  }

  /**
   * `UpdateSettingsDto` keeps the stored day inside 11-25, where no month is
   * ever short of it. A row edited directly in the database could still hold
   * e.g. 31, which `Date.UTC` would silently roll over into the next month —
   * a wrong boundary, not an error. So it is checked here, on the path that
   * computes boundaries.
   *
   * Deliberately not checked when reading or writing settings: `GET` should
   * report the row as it really is, and `PUT` is how an admin repairs it.
   */
  private assertUsableCycleStartDay(cycleStartDay: number): void {
    if (
      cycleStartDay < MIN_CYCLE_START_DAY ||
      cycleStartDay > MAX_CYCLE_START_DAY
    ) {
      throw new InternalServerErrorException(
        `Stored cycleStartDay (${cycleStartDay}) is outside the supported range ${MIN_CYCLE_START_DAY}-${MAX_CYCLE_START_DAY}. Fix it via PUT /settings.`,
      );
    }
  }

  private toResponseDto(settings: AppSettings): SettingsResponseDto {
    return {
      cycleStartDay: settings.cycleStartDay,
      cycleEndDay: settings.cycleEndDay,
    };
  }
}
