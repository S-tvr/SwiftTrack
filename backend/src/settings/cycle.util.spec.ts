import { BadRequestException } from '@nestjs/common';
import {
  computeCycleRange,
  formatCycleKey,
  hoursWithinCycle,
  isSplitAcrossCycle,
  parseCycleKey,
  resolveCurrentCycleKey,
  shiftCycleKey,
  toCycleRangeDto,
} from './cycle.util';

const DEFAULT_START_DAY = 25;
const utc = (iso: string): Date => new Date(iso);

describe('parseCycleKey', () => {
  it('parses a valid key into a 1-based month', () => {
    expect(parseCycleKey('2026-07')).toEqual({ year: 2026, month: 7 });
    expect(parseCycleKey('2026-01')).toEqual({ year: 2026, month: 1 });
    expect(parseCycleKey('2026-12')).toEqual({ year: 2026, month: 12 });
  });

  it.each(['2026-13', '2026-00', '2026-7', '26-07', '2026/07', 'nonsense', ''])(
    'rejects %p with a 400',
    (invalid) => {
      expect(() => parseCycleKey(invalid)).toThrow(BadRequestException);
    },
  );
});

describe('formatCycleKey', () => {
  it('zero-pads the month', () => {
    expect(formatCycleKey(2026, 7)).toBe('2026-07');
    expect(formatCycleKey(2026, 12)).toBe('2026-12');
  });
});

describe('computeCycleRange', () => {
  it('wraps across the month boundary — never a same-month range', () => {
    const { start, endExclusive } = computeCycleRange(
      '2026-07',
      DEFAULT_START_DAY,
    );
    expect(start.toISOString()).toBe('2026-07-25T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-08-25T00:00:00.000Z');
  });

  it('rolls the year over for a December cycle', () => {
    const { start, endExclusive } = computeCycleRange(
      '2026-12',
      DEFAULT_START_DAY,
    );
    expect(start.toISOString()).toBe('2026-12-25T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2027-01-25T00:00:00.000Z');
  });

  it('needs no clamping for February — every allowed day exists in every month', () => {
    expect(computeCycleRange('2026-02', 11)).toEqual({
      start: utc('2026-02-11T00:00:00.000Z'),
      endExclusive: utc('2026-03-11T00:00:00.000Z'),
    });
    // 2028 is a leap year; the 25th exists either way.
    expect(computeCycleRange('2028-02', 25)).toEqual({
      start: utc('2028-02-25T00:00:00.000Z'),
      endExclusive: utc('2028-03-25T00:00:00.000Z'),
    });
  });

  it('makes consecutive cycles meet at exactly one instant', () => {
    const july = computeCycleRange('2026-07', DEFAULT_START_DAY);
    const august = computeCycleRange('2026-08', DEFAULT_START_DAY);
    // No gap and no overlap: this identity is what makes splitting exact.
    expect(july.endExclusive.getTime()).toBe(august.start.getTime());
  });
});

describe('shiftCycleKey', () => {
  it('steps within a year', () => {
    expect(shiftCycleKey('2026-07', -1)).toBe('2026-06');
    expect(shiftCycleKey('2026-07', 1)).toBe('2026-08');
  });

  it('crosses the year boundary in both directions', () => {
    expect(shiftCycleKey('2026-01', -1)).toBe('2025-12');
    expect(shiftCycleKey('2026-12', 1)).toBe('2027-01');
  });
});

describe('resolveCurrentCycleKey', () => {
  it('returns the cycle that has already started, not the calendar month', () => {
    // 3 August, boundary on the 25th: the running cycle began 25 July.
    // The naive `now.toISOString().slice(0, 7)` would answer "2026-08" — a
    // cycle that has not started yet, i.e. an empty page for hours worked.
    expect(
      resolveCurrentCycleKey(
        utc('2026-08-03T10:00:00.000Z'),
        DEFAULT_START_DAY,
      ),
    ).toBe('2026-07');
  });

  it('switches on the boundary day itself', () => {
    expect(
      resolveCurrentCycleKey(
        utc('2026-08-24T23:59:59.999Z'),
        DEFAULT_START_DAY,
      ),
    ).toBe('2026-07');
    expect(
      resolveCurrentCycleKey(
        utc('2026-08-25T00:00:00.000Z'),
        DEFAULT_START_DAY,
      ),
    ).toBe('2026-08');
  });

  it('steps back into the previous year in early January', () => {
    expect(
      resolveCurrentCycleKey(
        utc('2026-01-05T00:00:00.000Z'),
        DEFAULT_START_DAY,
      ),
    ).toBe('2025-12');
  });

  it('always names a cycle that actually contains now', () => {
    const now = utc('2026-08-03T10:00:00.000Z');
    const { start, endExclusive } = computeCycleRange(
      resolveCurrentCycleKey(now, DEFAULT_START_DAY),
      DEFAULT_START_DAY,
    );
    expect(now.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(now.getTime()).toBeLessThan(endExclusive.getTime());
  });
});

describe('hoursWithinCycle', () => {
  const july = computeCycleRange('2026-07', DEFAULT_START_DAY); // [25 Jul, 25 Aug)
  const august = computeCycleRange('2026-08', DEFAULT_START_DAY); // [25 Aug, 25 Sep)

  it('returns the full length for a shift entirely inside the cycle', () => {
    expect(
      hoursWithinCycle(
        utc('2026-08-03T08:00:00.000Z'),
        utc('2026-08-03T16:30:00.000Z'),
        july,
      ),
    ).toBe(8.5);
  });

  it('splits a boundary-crossing shift across both cycles, losing nothing', () => {
    const start = utc('2026-08-24T20:00:00.000Z');
    const end = utc('2026-08-25T03:00:00.000Z');

    expect(hoursWithinCycle(start, end, july)).toBe(4);
    expect(hoursWithinCycle(start, end, august)).toBe(3);
    // The whole point: the parts sum to the shift, so no hour is lost at a
    // boundary and none is paid twice.
    expect(
      hoursWithinCycle(start, end, july) + hoursWithinCycle(start, end, august),
    ).toBe(7);
  });

  it('counts an open shift as zero — it cannot be split without an end', () => {
    expect(hoursWithinCycle(utc('2026-08-03T08:00:00.000Z'), null, july)).toBe(
      0,
    );
  });

  it('returns zero for a shift entirely outside the cycle', () => {
    expect(
      hoursWithinCycle(
        utc('2026-09-01T08:00:00.000Z'),
        utc('2026-09-01T16:00:00.000Z'),
        july,
      ),
    ).toBe(0);
  });

  it('treats the exclusive boundary as belonging to the next cycle', () => {
    // Ends exactly at the boundary — wholly in July, nothing in August.
    const endsAtBoundary = {
      start: utc('2026-08-24T22:00:00.000Z'),
      end: utc('2026-08-25T00:00:00.000Z'),
    };
    expect(
      hoursWithinCycle(endsAtBoundary.start, endsAtBoundary.end, july),
    ).toBe(2);
    expect(
      hoursWithinCycle(endsAtBoundary.start, endsAtBoundary.end, august),
    ).toBe(0);

    // Starts exactly at the boundary — wholly in August.
    const startsAtBoundary = {
      start: utc('2026-08-25T00:00:00.000Z'),
      end: utc('2026-08-25T02:00:00.000Z'),
    };
    expect(
      hoursWithinCycle(startsAtBoundary.start, startsAtBoundary.end, july),
    ).toBe(0);
    expect(
      hoursWithinCycle(startsAtBoundary.start, startsAtBoundary.end, august),
    ).toBe(2);
  });

  it('clips a shift that swallows the whole cycle to the cycle length', () => {
    expect(
      hoursWithinCycle(
        utc('2026-06-01T00:00:00.000Z'),
        utc('2026-10-01T00:00:00.000Z'),
        july,
      ),
    ).toBe(31 * 24); // 25 Jul -> 25 Aug
  });
});

describe('isSplitAcrossCycle', () => {
  const july = computeCycleRange('2026-07', DEFAULT_START_DAY);

  it('flags a shift that extends past either edge', () => {
    expect(
      isSplitAcrossCycle(
        utc('2026-08-24T20:00:00.000Z'),
        utc('2026-08-25T03:00:00.000Z'),
        july,
      ),
    ).toBe(true);
    expect(
      isSplitAcrossCycle(
        utc('2026-07-24T20:00:00.000Z'),
        utc('2026-07-25T03:00:00.000Z'),
        july,
      ),
    ).toBe(true);
  });

  it('does not flag a shift ending exactly at the boundary', () => {
    expect(
      isSplitAcrossCycle(
        utc('2026-08-24T22:00:00.000Z'),
        utc('2026-08-25T00:00:00.000Z'),
        july,
      ),
    ).toBe(false);
  });

  it('does not flag an open shift', () => {
    expect(
      isSplitAcrossCycle(utc('2026-08-03T08:00:00.000Z'), null, july),
    ).toBe(false);
  });
});

describe('toCycleRangeDto', () => {
  it('exposes an inclusive cycleEnd for display and the neighbouring keys', () => {
    const range = computeCycleRange('2026-07', DEFAULT_START_DAY);
    expect(toCycleRangeDto('2026-07', range)).toEqual({
      cycle: '2026-07',
      prevCycle: '2026-06',
      nextCycle: '2026-08',
      cycleStart: '2026-07-25T00:00:00.000Z',
      // endExclusive - 1ms: the last instant inside the cycle, so the UI can
      // print "25 Jul - 24 Aug" without doing arithmetic of its own.
      cycleEnd: '2026-08-24T23:59:59.999Z',
    });
  });

  it('never lets the displayed end reach the next cycle start', () => {
    const range = computeCycleRange('2026-07', DEFAULT_START_DAY);
    const dto = toCycleRangeDto('2026-07', range);
    expect(new Date(dto.cycleEnd).getTime()).toBeLessThan(
      range.endExclusive.getTime(),
    );
  });
});
