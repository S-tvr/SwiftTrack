import { computeCycleRange } from '../settings/cycle.util';
import {
  buildDayZoneHours,
  centiToNumber,
  PayZone,
  resolveZone,
  splitShiftIntoDayZoneSegments,
  sumZoneCentiHours,
  zonePayIsk,
  zoneRateCentiIsk,
} from './rate-zones.util';

const utc = (iso: string): Date => new Date(iso);

// July 2026: the 25th is a Saturday, so 27 = Mon, 28 = Tue, 29 = Wed,
// 30 = Thu, 31 = Fri, 1 Aug = Sat, 2 Aug = Sun. Every date below is chosen
// from that week so the weekday is obvious while reading the test.
const CYCLE = computeCycleRange('2026-07', 25); // [25 Jul, 25 Aug)

const shift = (startTime: string, endTime: string | null) => ({
  startTime: utc(startTime),
  endTime: endTime === null ? null : utc(endTime),
});

describe('resolveZone', () => {
  it.each([
    ['2026-07-27T00:00:00Z', PayZone.NIGHT],
    ['2026-07-27T07:59:59Z', PayZone.NIGHT],
    ['2026-07-27T08:00:00Z', PayZone.DAY],
    ['2026-07-27T16:59:59Z', PayZone.DAY],
    ['2026-07-27T17:00:00Z', PayZone.EVENING],
    ['2026-07-27T23:59:59Z', PayZone.EVENING],
  ])('resolves the weekday instant %s to %s', (instant, expected) => {
    expect(resolveZone(utc(instant))).toBe(expected);
  });

  it.each([
    '2026-07-25T03:00:00Z', // Saturday, small hours
    '2026-07-25T10:00:00Z', // Saturday, working hours
    '2026-07-26T20:00:00Z', // Sunday, evening
  ])('resolves the weekend instant %s to WEEKEND', (instant) => {
    expect(resolveZone(utc(instant))).toBe(PayZone.WEEKEND);
  });

  it('starts the weekend at Saturday 00:00 — Friday evening is still EVENING', () => {
    expect(resolveZone(utc('2026-07-31T23:59:59Z'))).toBe(PayZone.EVENING);
    expect(resolveZone(utc('2026-08-01T00:00:00Z'))).toBe(PayZone.WEEKEND);
  });

  it('ends the weekend at Monday 00:00 — Monday small hours are NIGHT', () => {
    expect(resolveZone(utc('2026-07-26T23:59:59Z'))).toBe(PayZone.WEEKEND);
    expect(resolveZone(utc('2026-07-27T00:00:00Z'))).toBe(PayZone.NIGHT);
  });
});

describe('splitShiftIntoDayZoneSegments', () => {
  it('leaves a shift inside a single zone as one segment', () => {
    const segments = splitShiftIntoDayZoneSegments(
      utc('2026-07-27T09:00:00Z'),
      utc('2026-07-27T15:00:00Z'),
      CYCLE,
    );
    expect(segments).toEqual([
      {
        date: '2026-07-27',
        zone: PayZone.DAY,
        ms: 6 * 3_600_000,
        startMs: utc('2026-07-27T09:00:00Z').getTime(),
      },
    ]);
  });

  it('cuts at 17:00 within one day', () => {
    const segments = splitShiftIntoDayZoneSegments(
      utc('2026-07-28T12:00:00Z'),
      utc('2026-07-28T20:15:00Z'),
      CYCLE,
    );
    expect(segments).toEqual([
      {
        date: '2026-07-28',
        zone: PayZone.DAY,
        ms: 5 * 3_600_000,
        startMs: utc('2026-07-28T12:00:00Z').getTime(),
      },
      {
        date: '2026-07-28',
        zone: PayZone.EVENING,
        ms: 3.25 * 3_600_000,
        // The second piece begins exactly where the first ended, which is what
        // lets the overtime threshold walk these in order.
        startMs: utc('2026-07-28T17:00:00Z').getTime(),
      },
    ]);
  });

  it('splits a night shift across midnight into two dates and two zones', () => {
    const segments = splitShiftIntoDayZoneSegments(
      utc('2026-07-29T22:00:00Z'),
      utc('2026-07-30T06:00:00Z'),
      CYCLE,
    );
    expect(segments).toEqual([
      {
        date: '2026-07-29',
        zone: PayZone.EVENING,
        ms: 2 * 3_600_000,
        startMs: utc('2026-07-29T22:00:00Z').getTime(),
      },
      {
        date: '2026-07-30',
        zone: PayZone.NIGHT,
        ms: 6 * 3_600_000,
        startMs: utc('2026-07-30T00:00:00Z').getTime(),
      },
    ]);
  });

  it('hands over from Friday evening to Saturday weekend at midnight', () => {
    const segments = splitShiftIntoDayZoneSegments(
      utc('2026-07-31T22:00:00Z'),
      utc('2026-08-01T06:00:00Z'),
      CYCLE,
    );
    expect(segments.map((segment) => segment.zone)).toEqual([
      PayZone.EVENING,
      PayZone.WEEKEND,
    ]);
  });

  it('hands over from Sunday weekend to Monday night at midnight', () => {
    const segments = splitShiftIntoDayZoneSegments(
      utc('2026-07-26T22:00:00Z'),
      utc('2026-07-27T06:00:00Z'),
      CYCLE,
    );
    expect(segments.map((segment) => segment.zone)).toEqual([
      PayZone.WEEKEND,
      PayZone.NIGHT,
    ]);
  });

  it('yields nothing for an open shift — it is not payable until closed', () => {
    expect(
      splitShiftIntoDayZoneSegments(utc('2026-07-27T09:00:00Z'), null, CYCLE),
    ).toEqual([]);
  });

  it('yields nothing for a zero-length shift', () => {
    expect(
      splitShiftIntoDayZoneSegments(
        utc('2026-07-27T09:00:00Z'),
        utc('2026-07-27T09:00:00Z'),
        CYCLE,
      ),
    ).toEqual([]);
  });

  it('yields nothing for a shift entirely outside the cycle', () => {
    expect(
      splitShiftIntoDayZoneSegments(
        utc('2026-07-20T09:00:00Z'),
        utc('2026-07-20T17:00:00Z'),
        CYCLE,
      ),
    ).toEqual([]);
  });

  it('clips to the cycle start, keeping only the part on this side', () => {
    // 24 Jul is the Friday before the cycle opens at 25 Jul 00:00.
    const segments = splitShiftIntoDayZoneSegments(
      utc('2026-07-24T20:00:00Z'),
      utc('2026-07-25T03:00:00Z'),
      CYCLE,
    );
    expect(segments).toEqual([
      {
        date: '2026-07-25',
        zone: PayZone.WEEKEND,
        ms: 3 * 3_600_000,
        // Clipped: the segment starts at the cycle boundary, not at 20:00 the
        // evening before.
        startMs: utc('2026-07-25T00:00:00Z').getTime(),
      },
    ]);
  });
});

describe('buildDayZoneHours', () => {
  it('merges a weekend day back into a single cell', () => {
    // Cut internally at 08:00 and 17:00, but the zone never changes on a
    // Saturday, so the row must show one WEEKEND figure and not three.
    const [day] = buildDayZoneHours(
      [shift('2026-07-25T06:00:00Z', '2026-07-25T20:00:00Z')],
      CYCLE,
    );
    expect(day.centiHours[PayZone.WEEKEND]).toBe(1400);
    expect(day.totalCentiHours).toBe(1400);
  });

  it('rounds hours to two decimals', () => {
    const [day] = buildDayZoneHours(
      [shift('2026-07-27T08:00:00Z', '2026-07-27T16:07:00Z')], // 8h07m
      CYCLE,
    );
    expect(centiToNumber(day.centiHours[PayZone.DAY])).toBe(8.12);
  });

  it('accumulates same-day shifts BEFORE rounding, not after', () => {
    // Two 20-second shifts: rounded separately they would be 0.01 each and
    // total 0.02· accumulated first they are 40 seconds, which is 0.01.
    const [day] = buildDayZoneHours(
      [
        shift('2026-07-27T08:00:00Z', '2026-07-27T08:00:20Z'),
        shift('2026-07-27T09:00:00Z', '2026-07-27T09:00:20Z'),
      ],
      CYCLE,
    );
    expect(day.centiHours[PayZone.DAY]).toBe(1);
  });

  it('lists only days that have hours, in ascending order', () => {
    const days = buildDayZoneHours(
      [
        shift('2026-07-31T08:00:00Z', '2026-07-31T13:45:00Z'),
        shift('2026-07-25T10:00:00Z', '2026-07-25T16:30:00Z'),
        shift('2026-07-28T12:00:00Z', '2026-07-28T20:15:00Z'),
      ],
      CYCLE,
    );
    expect(days.map((day) => day.date)).toEqual([
      '2026-07-25',
      '2026-07-28',
      '2026-07-31',
    ]);
  });

  it('produces no row at all for an open shift', () => {
    expect(
      buildDayZoneHours([shift('2026-07-27T09:00:00Z', null)], CYCLE),
    ).toEqual([]);
  });

  it('always carries all five zone keys, so the client never handles a gap', () => {
    const [day] = buildDayZoneHours(
      [shift('2026-07-27T09:00:00Z', '2026-07-27T15:00:00Z')],
      CYCLE,
    );
    // Sorted, so this is alphabetical order rather than display order.
    expect(Object.keys(day.centiHours).sort()).toEqual([
      PayZone.DAY,
      PayZone.EVENING,
      PayZone.NIGHT,
      PayZone.OVERTIME,
      PayZone.WEEKEND,
    ]);
    expect(day.centiHours[PayZone.NIGHT]).toBe(0);
    expect(day.centiHours[PayZone.OVERTIME]).toBe(0);
  });

  it('clips a shift that swallows the whole cycle to the cycle length', () => {
    // Inherited from the old hoursWithinCycle suite: 25 Jul -> 25 Aug is 31
    // days, and not one hour of a four-month shift may spill past either edge.
    const days = buildDayZoneHours(
      [shift('2026-06-01T00:00:00Z', '2026-10-01T00:00:00Z')],
      CYCLE,
    );
    const total = days.reduce((sum, day) => sum + day.totalCentiHours, 0);
    expect(days).toHaveLength(31);
    expect(total).toBe(31 * 24 * 100);
  });

  it('treats the exclusive boundary as belonging to the next cycle', () => {
    // Ends exactly at the cycle start — nothing of it is in this cycle.
    expect(
      buildDayZoneHours(
        [shift('2026-07-24T22:00:00Z', '2026-07-25T00:00:00Z')],
        CYCLE,
      ),
    ).toEqual([]);

    // Starts exactly at it — wholly inside.
    const [day] = buildDayZoneHours(
      [shift('2026-07-25T00:00:00Z', '2026-07-25T02:00:00Z')],
      CYCLE,
    );
    expect(day).toEqual(
      expect.objectContaining({ date: '2026-07-25', totalCentiHours: 200 }),
    );
  });

  it('splits a boundary-crossing shift between two cycles, with the parts summing to the whole', () => {
    // 24 Jul 20:00 -> 25 Jul 03:00 is the split case from step 4, now zoned:
    // Friday evening on one side, Saturday weekend on the other.
    const june = computeCycleRange('2026-06', 25); // [25 Jun, 25 Jul)
    const entry = shift('2026-07-24T20:00:00Z', '2026-07-25T03:00:00Z');

    const [juneDay] = buildDayZoneHours([entry], june);
    const [julyDay] = buildDayZoneHours([entry], CYCLE);

    expect(juneDay.date).toBe('2026-07-24');
    expect(juneDay.centiHours[PayZone.EVENING]).toBe(400);
    expect(julyDay.date).toBe('2026-07-25');
    expect(julyDay.centiHours[PayZone.WEEKEND]).toBe(300);
    expect(juneDay.totalCentiHours + julyDay.totalCentiHours).toBe(700);
  });
});

describe('sumZoneCentiHours', () => {
  it('is an exact sum of the cells — the column always adds up', () => {
    const days = buildDayZoneHours(
      [
        shift('2026-07-25T10:00:00Z', '2026-07-25T16:30:00Z'),
        shift('2026-07-28T12:00:00Z', '2026-07-28T20:15:00Z'),
      ],
      CYCLE,
    );
    const totals = sumZoneCentiHours(days);

    expect(totals).toEqual({
      [PayZone.DAY]: 500,
      [PayZone.EVENING]: 325,
      [PayZone.NIGHT]: 0,
      [PayZone.WEEKEND]: 650,
      // Nowhere near 173.33 hours, so nothing has been moved to overtime.
      [PayZone.OVERTIME]: 0,
    });
    const fromCells = days.reduce((sum, day) => sum + day.totalCentiHours, 0);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(fromCells);
  });
});

describe('the overtime threshold', () => {
  /**
   * Weekday 08:00-17:00 shifts, one per date, all DAY. 9 hours each, so 19 of
   * them is 171.00 hours — just under the threshold — and the 20th crosses it.
   * Dates are generated rather than listed so the arithmetic below stays
   * readable; weekends are skipped so every hour lands in a single zone and any
   * movement to OVERTIME is unambiguous.
   */
  const weekdayShifts = (count: number) => {
    const shifts: { startTime: Date; endTime: Date | null }[] = [];
    const cursor = new Date(Date.UTC(2026, 6, 27)); // Mon 27 Jul
    while (shifts.length < count) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) {
        const date = cursor.toISOString().slice(0, 10);
        shifts.push(shift(`${date}T08:00:00Z`, `${date}T17:00:00Z`));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return shifts;
  };

  const zoneTotal = (
    days: ReturnType<typeof buildDayZoneHours>,
    zone: PayZone,
  ) => sumZoneCentiHours(days)[zone];

  it('leaves a cycle under the threshold completely untouched', () => {
    const days = buildDayZoneHours(weekdayShifts(19), CYCLE); // 171.00 h
    expect(zoneTotal(days, PayZone.DAY)).toBe(17_100);
    expect(zoneTotal(days, PayZone.OVERTIME)).toBe(0);
  });

  it('caps the normal zones at exactly 173.33 hours and overflows the rest', () => {
    const days = buildDayZoneHours(weekdayShifts(20), CYCLE); // 180.00 h
    const totals = sumZoneCentiHours(days);
    const normal =
      totals[PayZone.DAY] +
      totals[PayZone.EVENING] +
      totals[PayZone.NIGHT] +
      totals[PayZone.WEEKEND];

    expect(normal).toBe(17_333);
    expect(totals[PayZone.OVERTIME]).toBe(18_000 - 17_333); // 6.67 h
  });

  it('moves hours between zones without creating or destroying any', () => {
    // 21 is every weekday the cycle contains from 27 Jul on; asking for more
    // would generate shifts past 25 Aug, which the clipping drops — making the
    // comparison below fail for a reason that has nothing to do with overtime.
    const shifts = weekdayShifts(21);
    const days = buildDayZoneHours(shifts, CYCLE);

    const worked = shifts.reduce(
      (sum, s) => sum + (s.endTime!.getTime() - s.startTime.getTime()),
      0,
    );
    const total = days.reduce((sum, day) => sum + day.totalCentiHours, 0);
    expect(total).toBe(worked / 36_000);

    // And each row still totals the hours actually worked that date.
    for (const day of days) {
      const summed = Object.values(day.centiHours).reduce((a, b) => a + b, 0);
      expect(summed).toBe(day.totalCentiHours);
    }
  });

  it('does not depend on the order the shifts arrive in', () => {
    // ⚠️ The shifts here MUST be asymmetric under reversal — of mixed zones,
    // and with the threshold falling inside the last one. 22 identical 9 h DAY
    // shifts reverse into an identical sequence, so that version of this test
    // passed even with the chronological sort deleted (found by mutation
    // testing in the step 16 review). This version fails without it.
    //
    // 19 weekday shifts = 171.00 h, leaving 2.33 h of room. Then a night shift
    // crossing midnight: its EVENING half (2 h, Thu) is worked BEFORE its NIGHT
    // half (6 h, Fri). Reversed, an unsorted walk would meet the NIGHT piece
    // first and cap that instead — moving 5.67 h between two differently-priced
    // zones.
    const shifts = [
      ...weekdayShifts(19),
      shift('2026-08-20T22:00:00Z', '2026-08-21T06:00:00Z'),
    ];

    const forwards = sumZoneCentiHours(buildDayZoneHours(shifts, CYCLE));
    const backwards = sumZoneCentiHours(
      buildDayZoneHours([...shifts].reverse(), CYCLE),
    );

    // Prisma returns rows in no guaranteed order, so this is the property that
    // makes the wage deterministic — not a tidiness check.
    expect(backwards).toEqual(forwards);

    // And pin the values, so a future change cannot satisfy the equality above
    // by making BOTH sides wrong in the same way.
    expect(forwards[PayZone.DAY]).toBe(17_100);
    expect(forwards[PayZone.EVENING]).toBe(200);
    expect(forwards[PayZone.NIGHT]).toBe(33);
    expect(forwards[PayZone.OVERTIME]).toBe(567);
  });

  it('starts overtime at the threshold, not at the end of the shift carrying it', () => {
    // 19 shifts = 171.00 h, leaving 2.33 h of room. The 20th runs 08:00-17:00,
    // so it must split: 2.33 h stays DAY, the remaining 6.67 h becomes OVERTIME
    // — on the same date, which is what the day table shows.
    const days = buildDayZoneHours(weekdayShifts(20), CYCLE);
    const crossing = days[days.length - 1];

    expect(crossing.centiHours[PayZone.DAY]).toBe(233);
    expect(crossing.centiHours[PayZone.OVERTIME]).toBe(667);
    expect(crossing.totalCentiHours).toBe(900);
  });

  it('keeps the zone a night shift was worked in, up to the threshold', () => {
    // The case that a zone-ordering shortcut gets wrong: a shift running
    // 22:00 -> 06:00 contributes EVENING on one date and NIGHT on the next, and
    // the NIGHT half is worked LATER despite NIGHT being the earlier zone of
    // its own date. Chronological order is what decides which half is capped.
    const shifts = [
      ...weekdayShifts(19), // 171.00 h, 2.33 h of room left
      shift('2026-08-24T22:00:00Z', '2026-08-25T00:00:00Z'), // Mon evening, 2 h
    ];
    const days = buildDayZoneHours(shifts, CYCLE);
    const totals = sumZoneCentiHours(days);

    // The whole 2 h evening piece fits under the threshold.
    expect(totals[PayZone.EVENING]).toBe(200);
    expect(totals[PayZone.OVERTIME]).toBe(0);
  });

  it('prices overtime at +80% of the base rate', () => {
    expect(zoneRateCentiIsk(2450, PayZone.OVERTIME)).toBe(441_000); // 4,410.00
    expect(centiToNumber(zoneRateCentiIsk(2450, PayZone.OVERTIME))).toBe(4410);
  });
});

describe('zoneRateCentiIsk', () => {
  it('is exact to the hundredth for any whole-ISK hourly rate', () => {
    expect(zoneRateCentiIsk(2450, PayZone.DAY)).toBe(245_000); // 2,450.00
    expect(zoneRateCentiIsk(2450, PayZone.EVENING)).toBe(325_850); // 3,258.50
    expect(zoneRateCentiIsk(2450, PayZone.NIGHT)).toBe(355_250); // 3,552.50
    expect(zoneRateCentiIsk(2450, PayZone.WEEKEND)).toBe(355_250);
  });

  it('lands on whole ISK when the hourly rate is a multiple of 100', () => {
    expect(centiToNumber(zoneRateCentiIsk(2500, PayZone.EVENING))).toBe(3325);
    expect(centiToNumber(zoneRateCentiIsk(2500, PayZone.WEEKEND))).toBe(3625);
  });

  it('never rounds — a fractional rate keeps its hundredths', () => {
    expect(centiToNumber(zoneRateCentiIsk(2450, PayZone.EVENING))).toBe(3258.5);
  });
});

describe('zonePayIsk', () => {
  it('rounds to whole ISK once, at the zone', () => {
    expect(zonePayIsk(1887, 245_000)).toBe(46_232); // 18.87 x 2,450.00
    expect(zonePayIsk(525, 325_850)).toBe(17_107); // 5.25 x 3,258.50
    expect(zonePayIsk(600, 355_250)).toBe(21_315); // 6.00 x 3,552.50
    expect(zonePayIsk(1250, 355_250)).toBe(44_406); // 12.50 x 3,552.50
  });

  it('rounds a half króna up, decided on integers rather than a float', () => {
    // 1.00 h x 2,450.50 = 2,450.50 exactly.
    expect(zonePayIsk(100, 245_050)).toBe(2451);
    expect(zonePayIsk(100, 245_049)).toBe(2450);
  });

  it('pays nothing for no hours', () => {
    expect(zonePayIsk(0, 355_250)).toBe(0);
  });
});

describe('the worked example, end to end', () => {
  const HOURLY_RATE = 2450;
  const shifts = [
    shift('2026-07-25T10:00:00Z', '2026-07-25T16:30:00Z'), // Sat  6.50 weekend
    shift('2026-07-27T08:00:00Z', '2026-07-27T16:07:00Z'), // Mon  8.12 day
    shift('2026-07-28T12:00:00Z', '2026-07-28T20:15:00Z'), // Tue  5.00 day + 3.25 evening
    shift('2026-07-29T22:00:00Z', '2026-07-30T06:00:00Z'), // Wed  2.00 evening -> Thu 6.00 night
    shift('2026-07-31T08:00:00Z', '2026-07-31T13:45:00Z'), // Fri  5.75 day
    shift('2026-08-01T20:00:00Z', '2026-08-02T02:00:00Z'), // Sat  4.00 -> Sun 2.00 weekend
  ];

  const days = buildDayZoneHours(shifts, CYCLE);
  const totals = sumZoneCentiHours(days);

  it('produces one row per worked day', () => {
    expect(days.map((day) => day.date)).toEqual([
      '2026-07-25',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('totals 18.87 / 5.25 / 6.00 / 12.50 hours across the zones', () => {
    expect(centiToNumber(totals[PayZone.DAY])).toBe(18.87);
    expect(centiToNumber(totals[PayZone.EVENING])).toBe(5.25);
    expect(centiToNumber(totals[PayZone.NIGHT])).toBe(6);
    expect(centiToNumber(totals[PayZone.WEEKEND])).toBe(12.5);
  });

  it('pays 129,060 ISK, and the Pay column sums to exactly that', () => {
    const perZone = [
      PayZone.DAY,
      PayZone.EVENING,
      PayZone.NIGHT,
      PayZone.WEEKEND,
    ].map((zone) =>
      zonePayIsk(totals[zone], zoneRateCentiIsk(HOURLY_RATE, zone)),
    );

    expect(perZone).toEqual([46_232, 17_107, 21_315, 44_406]);
    expect(perZone.reduce((sum, pay) => sum + pay, 0)).toBe(129_060);
  });

  it('totals 42.62 hours, whether summed from the cells or from the zones', () => {
    const fromDays = days.reduce((sum, day) => sum + day.totalCentiHours, 0);
    const fromZones = Object.values(totals).reduce((a, b) => a + b, 0);
    expect(fromDays).toBe(4262);
    expect(fromZones).toBe(4262);
  });
});
