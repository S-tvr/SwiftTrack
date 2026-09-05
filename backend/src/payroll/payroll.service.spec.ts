import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayZone } from './rate-zones.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import type { UsersService } from '../users/users.service';

/**
 * Prisma is stubbed, following settings.service.spec.ts — no database, no
 * fixtures. The zone arithmetic itself is proved in rate-zones.util.spec.ts;
 * what this file covers is the service around it: who resolves to a 404, which
 * shifts the query asks for, who appears on the overview, and that the team
 * page and the employee's own page can never report different money.
 *
 * ⚠️ A stub returns whatever it was told, so this cannot prove the payroll
 * query is correct SQL. The boundary case that matters — `gt`/`lt` and never
 * `gte`/`lte`, so a shift touching the cycle edge is neither dropped nor double
 * counted — is asserted here against the *shape* of the where clause, and is
 * really proved by step 8b against real rows.
 */

const HOURLY_RATE = 2450;

const RANGE = {
  start: new Date('2026-07-25T00:00:00.000Z'),
  endExclusive: new Date('2026-08-25T00:00:00.000Z'),
};
const CYCLE_DTO = {
  cycle: '2026-07',
  prevCycle: '2026-06',
  nextCycle: '2026-08',
  cycleStart: '2026-07-25T00:00:00.000Z',
  cycleEnd: '2026-08-24T23:59:59.999Z',
};

const employee = (overrides = {}) => ({
  id: 2,
  name: 'Jane Employee',
  hourlyRate: HOURLY_RATE,
  isActive: true,
  ...overrides,
});

const shift = (userId: number, startTime: string, endTime: string) => ({
  userId,
  startTime: new Date(startTime),
  endTime: new Date(endTime),
});

/** The worked example from the spec: 42.62 hours across all four zones. */
const WORKED_EXAMPLE = (userId = 2) => [
  shift(userId, '2026-07-25T10:00:00Z', '2026-07-25T16:30:00Z'), // Sat 6.50 weekend
  shift(userId, '2026-07-27T08:00:00Z', '2026-07-27T16:07:00Z'), // Mon 8.12 day
  shift(userId, '2026-07-28T12:00:00Z', '2026-07-28T20:15:00Z'), // Tue 5.00 + 3.25
  shift(userId, '2026-07-29T22:00:00Z', '2026-07-30T06:00:00Z'), // Wed 2.00 -> Thu 6.00
  shift(userId, '2026-07-31T08:00:00Z', '2026-07-31T13:45:00Z'), // Fri 5.75 day
  shift(userId, '2026-08-01T20:00:00Z', '2026-08-02T02:00:00Z'), // Sat 4.00 -> Sun 2.00
];

interface StubOptions {
  payableShifts?: ReturnType<typeof shift>[];
  openShifts?: { userId: number }[];
  employeeRow?: ReturnType<typeof employee> | null;
  allEmployees?: ReturnType<typeof employee>[];
}

function makeService({
  payableShifts = [],
  openShifts = [],
  employeeRow = employee(),
  allEmployees = [],
}: StubOptions = {}) {
  // Dispatched on the where clause rather than on call order: the open-shift
  // query is the one asking for `endTime: null`.
  const findMany = jest
    .fn()
    .mockImplementation(({ where }: { where: { endTime: unknown } }) =>
      Promise.resolve(where.endTime === null ? openShifts : payableShifts),
    );
  const count = jest.fn().mockResolvedValue(openShifts.length);
  const resolveCycleRange = jest
    .fn()
    .mockResolvedValue({ range: RANGE, cycleDto: CYCLE_DTO });
  const findEmployeeRateAt = jest.fn().mockResolvedValue(employeeRow);
  const findAllEmployeeRatesAt = jest.fn().mockResolvedValue(allEmployees);

  const service = new PayrollService(
    { timeEntry: { findMany, count } } as unknown as PrismaService,
    { resolveCycleRange } as unknown as SettingsService,
    { findEmployeeRateAt, findAllEmployeeRatesAt } as unknown as UsersService,
  );

  return {
    service,
    findMany,
    count,
    resolveCycleRange,
    findEmployeeRateAt,
    findAllEmployeeRatesAt,
  };
}

describe('PayrollService.getPayrollForCycle', () => {
  it('resolves a non-employee id to a 404 — an admin id included', async () => {
    const { service } = makeService({ employeeRow: null });
    await expect(service.getPayrollForCycle(1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('fails loudly rather than paying 0 when an employee has no hourlyRate', async () => {
    const { service } = makeService({
      employeeRow: employee({ hourlyRate: null }),
    });
    await expect(service.getPayrollForCycle(2)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('takes cycle boundaries from SettingsService, never its own arithmetic', async () => {
    const { service, resolveCycleRange } = makeService();
    const result = await service.getPayrollForCycle(2, '2026-07');

    expect(resolveCycleRange).toHaveBeenCalledWith('2026-07');
    expect(result.cycle).toBe('2026-07');
    expect(result.cycleStart).toBe('2026-07-25T00:00:00.000Z');
  });

  /**
   * ⭐ The rate is resolved **at the cycle's start**, not "now". That single
   * argument is what makes a raise forward-effective: ask for today's rate here
   * and every past cycle silently reprices itself the moment somebody gets one.
   */
  it('resolves the rate as of the cycle start, never the current rate', async () => {
    const { service, findEmployeeRateAt } = makeService();
    await service.getPayrollForCycle(2, '2026-07');

    expect(findEmployeeRateAt).toHaveBeenCalledWith(2, RANGE.start);
  });

  it('asks only for CLOSED shifts overlapping the cycle, with gt/lt', async () => {
    const { service, findMany } = makeService();
    await service.getPayrollForCycle(2);

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: { in: [2] },
        endTime: { not: null, gt: RANGE.start },
        startTime: { lt: RANGE.endExclusive },
      },
      // Narrow on purpose: pricing a shift needs its two timestamps and
      // nothing else.
      select: { startTime: true, endTime: true },
    });
  });

  it('prices the worked example: 42.62 hours, 129,060 ISK', async () => {
    const { service } = makeService({ payableShifts: WORKED_EXAMPLE() });
    const result = await service.getPayrollForCycle(2);

    expect(result.totalHours).toBe(42.62);
    expect(result.totalPay).toBe(129_060);
    expect(result.hourlyRate).toBe(HOURLY_RATE);
    expect(result.name).toBe('Jane Employee');
  });

  it('returns zone lines whose pay adds up to totalPay exactly', async () => {
    const { service } = makeService({ payableShifts: WORKED_EXAMPLE() });
    const result = await service.getPayrollForCycle(2);

    expect(result.zones).toEqual([
      {
        zone: PayZone.DAY,
        label: 'Day',
        hours: 18.87,
        rate: 2450,
        pay: 46_232,
      },
      {
        zone: PayZone.EVENING,
        label: 'Evening +33%',
        hours: 5.25,
        rate: 3258.5,
        pay: 17_107,
      },
      {
        zone: PayZone.NIGHT,
        label: 'Night +45%',
        hours: 6,
        rate: 3552.5,
        pay: 21_315,
      },
      {
        zone: PayZone.WEEKEND,
        label: 'Weekend +45%',
        hours: 12.5,
        rate: 3552.5,
        pay: 44_406,
      },
    ]);
    const summed = result.zones.reduce((total, zone) => total + zone.pay, 0);
    expect(summed).toBe(result.totalPay);
  });

  it('returns one row per worked day, ascending, with all four zone keys', async () => {
    const { service } = makeService({ payableShifts: WORKED_EXAMPLE() });
    const result = await service.getPayrollForCycle(2);

    expect(result.days.map((day) => day.date)).toEqual([
      '2026-07-25',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
    expect(result.days[2]).toEqual({
      date: '2026-07-28',
      hours: { DAY: 5, EVENING: 3.25, NIGHT: 0, WEEKEND: 0 },
      totalHours: 8.25,
    });
  });

  it('has day hours that add up to the zone totals — the two views cannot disagree', async () => {
    const { service } = makeService({ payableShifts: WORKED_EXAMPLE() });
    const result = await service.getPayrollForCycle(2);

    const fromDays = result.days.reduce((sum, day) => sum + day.totalHours, 0);
    const fromZones = result.zones.reduce((sum, zone) => sum + zone.hours, 0);
    expect(Math.round(fromDays * 100)).toBe(4262);
    expect(Math.round(fromZones * 100)).toBe(4262);
  });

  it('still returns all four zones, at zero, for a cycle with no shifts', async () => {
    const { service } = makeService();
    const result = await service.getPayrollForCycle(2);

    expect(result.days).toEqual([]);
    expect(result.totalHours).toBe(0);
    expect(result.totalPay).toBe(0);
    expect(result.zones).toHaveLength(4);
    expect(
      result.zones.every((zone) => zone.hours === 0 && zone.pay === 0),
    ).toBe(true);
  });

  it('flags an open shift so the page can explain the missing day', async () => {
    const withOpen = makeService({ openShifts: [{ userId: 2 }] });
    expect((await withOpen.service.getPayrollForCycle(2)).hasOpenShift).toBe(
      true,
    );

    const withoutOpen = makeService();
    expect((await withoutOpen.service.getPayrollForCycle(2)).hasOpenShift).toBe(
      false,
    );
  });

  it('scopes the open-shift flag to the cycle, matching on startTime', async () => {
    const { service, count } = makeService();
    await service.getPayrollForCycle(2);

    expect(count).toHaveBeenCalledWith({
      where: {
        userId: { in: [2] },
        endTime: null,
        startTime: { gte: RANGE.start, lt: RANGE.endExclusive },
      },
    });
  });
});

describe('PayrollService.getOverview', () => {
  const jane = employee({ id: 2, name: 'Jane' });
  const bob = employee({ id: 3, name: 'Bob' });
  const gone = employee({ id: 4, name: 'Gone', isActive: false });

  it('returns an empty page rather than failing when there are no employees', async () => {
    const { service } = makeService({ allEmployees: [] });
    const result = await service.getOverview();

    expect(result.rows).toEqual([]);
    expect(result.totalCost).toBe(0);
    expect(result.cycle).toBe('2026-07');
  });

  it('lists an active employee with no hours — the admin needs to see who has not worked', async () => {
    const { service } = makeService({ allEmployees: [jane] });
    const result = await service.getOverview();

    expect(result.rows).toEqual([
      {
        userId: 2,
        name: 'Jane',
        totalHours: 0,
        totalPay: 0,
        hasOpenShift: false,
      },
    ]);
  });

  it('drops a deactivated employee who has nothing in this cycle', async () => {
    const { service } = makeService({ allEmployees: [jane, gone] });
    const result = await service.getOverview();

    expect(result.rows.map((row) => row.name)).toEqual(['Jane']);
  });

  it('keeps a deactivated employee who worked in this cycle — they still have to be paid', async () => {
    const { service } = makeService({
      allEmployees: [jane, gone],
      payableShifts: WORKED_EXAMPLE(4),
    });
    const result = await service.getOverview();

    const departed = result.rows.find((row) => row.name === 'Gone');
    expect(departed).toEqual({
      userId: 4,
      name: 'Gone',
      totalHours: 42.62,
      totalPay: 129_060,
      hasOpenShift: false,
    });
    expect(result.totalCost).toBe(129_060);
  });

  it('keeps a deactivated employee whose only trace is an open shift', async () => {
    // They can no longer log in to clock out, so the admin is the only one who
    // can close it. ⚠️ This row surfaces it only on the cycle the shift STARTED
    // in — the flag is cycle-scoped, so an open shift left behind in May is
    // invisible on July's overview and is found by navigating back to May.
    const { service } = makeService({
      allEmployees: [gone],
      openShifts: [{ userId: 4 }],
    });
    const result = await service.getOverview();

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].hasOpenShift).toBe(true);
  });

  it('totals the cost by summing already-rounded wages', async () => {
    const { service } = makeService({
      allEmployees: [jane, bob],
      payableShifts: [...WORKED_EXAMPLE(2), ...WORKED_EXAMPLE(3)],
    });
    const result = await service.getOverview();

    expect(result.rows.map((row) => row.totalPay)).toEqual([129_060, 129_060]);
    expect(result.totalCost).toBe(258_120);
  });

  it('reports exactly what the employee’s own page reports', async () => {
    const shifts = WORKED_EXAMPLE(2);
    const overview = await makeService({
      allEmployees: [jane],
      payableShifts: shifts,
    }).service.getOverview();
    const own = await makeService({
      payableShifts: shifts,
    }).service.getPayrollForCycle(2);

    expect(overview.rows[0].totalHours).toBe(own.totalHours);
    expect(overview.rows[0].totalPay).toBe(own.totalPay);
  });

  /**
   * ⭐ The overview asks `findAllEmployeeRatesAt`, the employee's own page asks
   * `findEmployeeRateAt` — **two different readers** for the same fact, which is
   * a way for the two pages to disagree that did not exist before rate history.
   * Sharing `summarise()` is no longer enough on its own: it guarantees the same
   * arithmetic, not the same rate going into it.
   *
   * Both are asked for `range.start`, so an employee who was on 2450 for this
   * cycle is priced at 2450 on both pages even after being raised to 2800.
   */
  it('prices a raised employee identically on both pages, at the cycle’s own rate', async () => {
    const shifts = WORKED_EXAMPLE(2);
    // The rate in force for the cycle being viewed — not the employee's
    // current one, which the raise has already moved on to.
    const rateForThisCycle = employee({ hourlyRate: HOURLY_RATE });

    const overviewService = makeService({
      allEmployees: [rateForThisCycle],
      payableShifts: shifts,
    });
    const ownService = makeService({
      employeeRow: rateForThisCycle,
      payableShifts: shifts,
    });

    const overview = await overviewService.service.getOverview('2026-07');
    const own = await ownService.service.getPayrollForCycle(2, '2026-07');

    // Both readers were asked as of the same instant — the cycle's start.
    expect(overviewService.findAllEmployeeRatesAt).toHaveBeenCalledWith(
      RANGE.start,
    );
    expect(ownService.findEmployeeRateAt).toHaveBeenCalledWith(2, RANGE.start);

    expect(overview.rows[0].totalPay).toBe(own.totalPay);
    expect(own.hourlyRate).toBe(HOURLY_RATE);
    expect(own.totalPay).toBe(129_060);
  });

  it('fetches every employee’s shifts in one query, not one query each', async () => {
    const { service, findMany } = makeService({
      allEmployees: [jane, bob, gone],
    });
    await service.getOverview();

    // Two calls total for the whole team: the payable shifts and the open ones.
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: { in: [2, 3, 4] }, // the whole team in one `in`, not three queries
        endTime: { not: null, gt: RANGE.start },
        startTime: { lt: RANGE.endExclusive },
      },
      select: { userId: true, startTime: true, endTime: true },
    });
  });
});
