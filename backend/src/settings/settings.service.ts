import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsResponseDto } from './dto/settings-response.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CycleRangeDto } from './dto/cycle-range.dto';
import {
  computeCycleRange,
  resolveCurrentCycleKey,
  toCycleRangeDto,
  type CycleRange,
} from './cycle.util';
import type { AppSettings } from '../generated/prisma/client';

const SETTINGS_ROW_ID = 1;
const MIN_CYCLE_START_DAY = 11;
const MAX_CYCLE_START_DAY = 25;

/**
 * What every cycle-aware caller needs: `range` to filter and clip with,
 * `cycleDto` to spread into the response.
 */
export interface ResolvedCycle {
  range: CycleRange;
  cycleDto: CycleRangeDto;
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

    const resolvedCycle =
      cycle ?? resolveCurrentCycleKey(new Date(), cycleStartDay);
    const range = computeCycleRange(resolvedCycle, cycleStartDay);

    return { range, cycleDto: toCycleRangeDto(resolvedCycle, range) };
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
