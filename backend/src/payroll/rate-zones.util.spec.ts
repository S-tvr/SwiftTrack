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
      { date: '2026-07-27', zone: PayZone.DAY, ms: 6 * 3_600_000 },
    ]);
  });

  it('cuts at 17:00 within one day', () => {
    const segments = splitShiftIntoDayZoneSegments(
      utc('2026-07-28T12:00:00Z'),
      utc('2026-07-28T20:15:00Z'),
      CYCLE,
    );
    expect(segments).toEqual([
      { date: '2026-07-28', zone: PayZone.DAY, ms: 5 * 3_600_000 },
      { date: '2026-07-28', zone: PayZone.EVENING, ms: 3.25 * 3_600_000 },
    ]);
  });

  it('splits a night shift across midnight into two dates and two zones', () => {
    const segments = splitShiftIntoDayZoneSegments(
      utc('2026-07-29T22:00:00Z'),
      utc('2026-07-30T06:00:00Z'),
      CYCLE,
    );
    expect(segments).toEqual([
      { date: '2026-07-29', zone: PayZone.EVENING, ms: 2 * 3_600_000 },
      { date: '2026-07-30', zone: PayZone.NIGHT, ms: 6 * 3_600_000 },
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
      { date: '2026-07-25', zone: PayZone.WEEKEND, ms: 3 * 3_600_000 },
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

  it('always carries all four zone keys, so the client never handles a gap', () => {
    const [day] = buildDayZoneHours(
      [shift('2026-07-27T09:00:00Z', '2026-07-27T15:00:00Z')],
      CYCLE,
    );
    expect(Object.keys(day.centiHours).sort()).toEqual([
      PayZone.DAY,
      PayZone.EVENING,
      PayZone.NIGHT,
      PayZone.WEEKEND,
    ]);
    expect(day.centiHours[PayZone.NIGHT]).toBe(0);
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
    });
    const fromCells = days.reduce((sum, day) => sum + day.totalCentiHours, 0);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(fromCells);
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
