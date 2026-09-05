import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { notFound } from '../common/domain-errors';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import type { CycleRange } from '../settings/cycle.util';
import {
  buildDayZoneHours,
  centiToNumber,
  PAY_ZONES,
  PayZone,
  sumZoneCentiHours,
  zonePayIsk,
  zoneRateCentiIsk,
  type DayZoneHours,
} from './rate-zones.util';
import {
  PayrollDayDto,
  PayrollResponseDto,
  PayrollZoneDto,
} from './dto/payroll-response.dto';
import {
  PayrollOverviewResponseDto,
  PayrollOverviewRowDto,
} from './dto/payroll-overview-response.dto';

/** Just enough of a TimeEntry to price it — see the `select` in the queries below. */
interface PayableShift {
  startTime: Date;
  endTime: Date | null;
}

interface CycleSummary {
  zones: PayrollZoneDto[];
  totalCentiHours: number;
  totalPay: number;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * One employee's breakdown, behind both `/payroll/me` and `/payroll/:userId`.
   *
   * Cycle boundaries come from `SettingsService`, which owns `AppSettings`, and
   * the employee comes from `UsersService`, which owns `User` — this service
   * computes neither of those for itself.
   */
  async getPayrollForCycle(
    userId: number,
    cycle?: string,
  ): Promise<PayrollResponseDto> {
    // The cycle is resolved first because the rate depends on it: an employee's
    // pay is priced with the rate in force at `range.start`, so there is nothing
    // to look up until the boundary is known. ⚠️ Do not move the employee lookup
    // back above this call.
    const { range, cycleDto } =
      await this.settingsService.resolveCycleRange(cycle);

    const employee = await this.usersService.findEmployeeRateAt(
      userId,
      range.start,
    );
    if (!employee) {
      throw notFound(
        ErrorCode.EMPLOYEE_NOT_FOUND,
        `Employee with id ${userId} not found.`,
      );
    }
    const hourlyRate = this.requireHourlyRate(employee);

    const [shifts, openShiftCount] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: this.payableShiftsWhere([userId], range),
        select: { startTime: true, endTime: true },
      }),
      this.prisma.timeEntry.count({
        where: this.openShiftsWhere([userId], range),
      }),
    ]);

    const days = buildDayZoneHours(shifts, range);
    const summary = this.summarise(days, hourlyRate);

    return {
      ...cycleDto,
      userId: employee.id,
      name: employee.name,
      hourlyRate,
      totalHours: centiToNumber(summary.totalCentiHours),
      totalPay: summary.totalPay,
      hasOpenShift: openShiftCount > 0,
      zones: summary.zones,
      days: days.map((day) => this.toDayDto(day)),
    };
  }

  /**
   * The whole team for one cycle, in four queries rather than four per person:
   * settings, employees, every relevant closed shift, every open one. The
   * per-employee grouping happens in memory — a cycle's worth of shifts for a
   * single business is a few hundred rows.
   */
  async getOverview(cycle?: string): Promise<PayrollOverviewResponseDto> {
    const { range, cycleDto } =
      await this.settingsService.resolveCycleRange(cycle);

    // Rates as of the cycle's start, so this page and the employee's own page
    // price the same cycle identically — including after a raise, which must
    // move neither of them.
    const employees = await this.usersService.findAllEmployeeRatesAt(
      range.start,
    );
    if (employees.length === 0) {
      return { ...cycleDto, totalCost: 0, rows: [] };
    }

    const employeeIds = employees.map((employee) => employee.id);
    const [shifts, openShifts] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: this.payableShiftsWhere(employeeIds, range),
        select: { userId: true, startTime: true, endTime: true },
      }),
      this.prisma.timeEntry.findMany({
        where: this.openShiftsWhere(employeeIds, range),
        select: { userId: true },
      }),
    ]);

    const shiftsByUser = new Map<number, PayableShift[]>();
    for (const shift of shifts) {
      const existing = shiftsByUser.get(shift.userId);
      if (existing) existing.push(shift);
      else shiftsByUser.set(shift.userId, [shift]);
    }
    const withOpenShift = new Set(openShifts.map((shift) => shift.userId));

    const rows: PayrollOverviewRowDto[] = [];
    for (const employee of employees) {
      const days = buildDayZoneHours(
        shiftsByUser.get(employee.id) ?? [],
        range,
      );
      const hasOpenShift = withOpenShift.has(employee.id);

      // An active employee always appears, even with no hours — the admin needs
      // to see who has not worked. A deactivated one appears only when this
      // cycle actually concerns them: they must still be paid for the days they
      // worked before leaving, but every past employee showing 0 for the rest
      // of time would bury the people who are still here.
      if (!employee.isActive && days.length === 0 && !hasOpenShift) continue;

      // Deliberately the same path as the single-employee page above, days
      // included: rounding happens per day cell, so summing zones straight from
      // milliseconds could differ by a hundredth of an hour from the figure the
      // admin sees after clicking through to that employee.
      const summary = this.summarise(days, this.requireHourlyRate(employee));
      rows.push({
        userId: employee.id,
        name: employee.name,
        totalHours: centiToNumber(summary.totalCentiHours),
        totalPay: summary.totalPay,
        hasOpenShift,
      });
    }

    return {
      ...cycleDto,
      // A sum of already-rounded wages, not a rounding of a sum: each row is a
      // real amount somebody is paid, so nothing is being rounded twice here.
      totalCost: rows.reduce((sum, row) => sum + row.totalPay, 0),
      rows,
    };
  }

  /**
   * The one place hours become money, shared by both endpoints so the team
   * overview and the employee's own page can never disagree.
   */
  private summarise(
    days: readonly DayZoneHours[],
    hourlyRate: number,
  ): CycleSummary {
    const zoneTotals = sumZoneCentiHours(days);

    const zones = PAY_ZONES.map(({ zone, label }) => {
      const rateCentiIsk = zoneRateCentiIsk(hourlyRate, zone);
      return {
        zone,
        label,
        hours: centiToNumber(zoneTotals[zone]),
        rate: centiToNumber(rateCentiIsk),
        pay: zonePayIsk(zoneTotals[zone], rateCentiIsk),
      };
    });

    return {
      zones,
      totalCentiHours: days.reduce((sum, day) => sum + day.totalCentiHours, 0),
      // A plain sum — `zonePayIsk` already rounded, and rounding again here is
      // what would make the Pay column stop adding up to the total.
      totalPay: zones.reduce((sum, zone) => sum + zone.pay, 0),
    };
  }

  /**
   * Payable shifts overlapping the cycle. Overlap, not containment: a shift
   * that starts before the cycle and ends inside it belongs to this cycle for
   * the part that falls within it, and `rate-zones.util` clips it to exactly
   * that part.
   *
   * `gt`/`lt` against the exclusive boundary, never `gte`/`lte` — that is what
   * makes adjacent cycles meet with no gap and no double count.
   *
   * ⚠️ NOT the query behind `GET /time-entries`. That one additionally lists
   * OPEN shifts so an employee can find and fix a missed clock-out· payroll
   * must exclude them, because a shift with no end cannot be priced. The two
   * queries are deliberately different and must not be merged.
   */
  private payableShiftsWhere(userIds: number[], range: CycleRange) {
    return {
      userId: { in: userIds },
      endTime: { not: null, gt: range.start },
      startTime: { lt: range.endExclusive },
    };
  }

  /**
   * Open shifts that began inside this cycle — matched on `startTime`, since a
   * shift with no end has nothing to overlap with. Cycle-scoped on purpose: the
   * flag explains hours missing from *this* cycle, so a shift running right now
   * must not raise a warning on a cycle from three months ago.
   */
  private openShiftsWhere(userIds: number[], range: CycleRange) {
    return {
      userId: { in: userIds },
      endTime: null,
      startTime: { gte: range.start, lt: range.endExclusive },
    };
  }

  private toDayDto(day: DayZoneHours): PayrollDayDto {
    return {
      date: day.date,
      hours: {
        [PayZone.DAY]: centiToNumber(day.centiHours[PayZone.DAY]),
        [PayZone.EVENING]: centiToNumber(day.centiHours[PayZone.EVENING]),
        [PayZone.NIGHT]: centiToNumber(day.centiHours[PayZone.NIGHT]),
        [PayZone.WEEKEND]: centiToNumber(day.centiHours[PayZone.WEEKEND]),
      },
      totalHours: centiToNumber(day.totalCentiHours),
    };
  }

  /**
   * A null here means no `UserRate` row is in force at this cycle's start.
   * `POST /users` writes one at the epoch for every employee it creates, so
   * every cycle — however old — has a rate to price with, and reaching this
   * means the rows were edited directly in the database.
   *
   * That fails loudly rather than defaulting to 0, for the same reason a missing
   * AppSettings row does: a silent 0 would quietly drop this person's wages out
   * of the team's total cost, which is precisely the money nobody would notice
   * was missing.
   */
  private requireHourlyRate(employee: {
    id: number;
    hourlyRate: number | null;
  }): number {
    if (employee.hourlyRate === null) {
      throw new InternalServerErrorException(
        `Employee ${employee.id} has no hourly rate in force for this cycle. Set one via PUT /users/${employee.id}.`,
      );
    }
    return employee.hourlyRate;
  }
}
