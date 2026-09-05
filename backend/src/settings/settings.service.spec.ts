import { InternalServerErrorException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AppSettings } from '../generated/prisma/client';

/**
 * These cover the glue between the stored row and the pure cycle functions:
 * that the day actually comes from the database rather than a constant, and
 * the two failure paths that cannot be reached over HTTP without corrupting
 * the settings row on purpose.
 *
 * Prisma is stubbed — the real DB read is covered by the endpoint checks.
 */
function serviceWith(row: AppSettings | null): {
  service: SettingsService;
  update: jest.Mock;
  findUnique: jest.Mock;
} {
  const update = jest.fn();
  const findUnique = jest.fn().mockResolvedValue(row);
  const prisma = {
    appSettings: { findUnique, update },
  } as unknown as PrismaService;
  return { service: new SettingsService(prisma), update, findUnique };
}

const row = (cycleStartDay: number, cycleEndDay: number): AppSettings => ({
  id: 1,
  cycleStartDay,
  cycleEndDay,
});

describe('SettingsService', () => {
  describe('getSettings', () => {
    it('returns the stored days', async () => {
      const { service } = serviceWith(row(25, 24));
      await expect(service.getSettings()).resolves.toEqual({
        cycleStartDay: 25,
        cycleEndDay: 24,
      });
    });

    it('reports a missing singleton row as a server error naming the fix', async () => {
      const { service } = serviceWith(null);
      await expect(service.getSettings()).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.getSettings()).rejects.toThrow(/prisma db seed/);
    });

    it('reports the row as it really is, so an out-of-range day can be repaired', async () => {
      // Deliberately not guarded here: GET must show the truth and PUT is the
      // way out. Only resolveCycleRange refuses to compute with it.
      const { service } = serviceWith(row(31, 30));
      await expect(service.getSettings()).resolves.toEqual({
        cycleStartDay: 31,
        cycleEndDay: 30,
      });
    });
  });

  describe('updateSettings', () => {
    it('writes both days to the singleton row', async () => {
      const { service, update } = serviceWith(row(25, 24));
      update.mockResolvedValue(row(11, 10));

      await expect(
        service.updateSettings({ cycleStartDay: 11, cycleEndDay: 10 }),
      ).resolves.toEqual({ cycleStartDay: 11, cycleEndDay: 10 });

      expect(update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { cycleStartDay: 11, cycleEndDay: 10 },
      });
    });

    it('fails with the seed message rather than an opaque Prisma error', async () => {
      const { service, update } = serviceWith(null);
      await expect(
        service.updateSettings({ cycleStartDay: 11, cycleEndDay: 10 }),
      ).rejects.toThrow(/prisma db seed/);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('resolveCycleRange', () => {
    it('resolves an explicit cycle from the stored day', async () => {
      const { service } = serviceWith(row(25, 24));
      const { range, cycleDto } = await service.resolveCycleRange('2026-07');

      expect(range.start.toISOString()).toBe('2026-07-25T00:00:00.000Z');
      expect(range.endExclusive.toISOString()).toBe('2026-08-25T00:00:00.000Z');
      expect(cycleDto).toEqual({
        cycle: '2026-07',
        prevCycle: '2026-06',
        nextCycle: '2026-08',
        cycleStart: '2026-07-25T00:00:00.000Z',
        cycleEnd: '2026-08-24T23:59:59.999Z',
      });
    });

    it('uses the stored day, not a hardcoded 25', async () => {
      const { service } = serviceWith(row(11, 10));
      const { range } = await service.resolveCycleRange('2026-07');

      expect(range.start.toISOString()).toBe('2026-07-11T00:00:00.000Z');
      expect(range.endExclusive.toISOString()).toBe('2026-08-11T00:00:00.000Z');
    });

    it('defaults to the cycle containing now when ?cycle= is omitted', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));
        const { cycleDto } = await service.resolveCycleRange();
        // 3 August, boundary on the 25th — the running cycle started 25 July.
        expect(cycleDto.cycle).toBe('2026-07');
      } finally {
        jest.useRealTimers();
      }
    });

    it('rejects a malformed cycle key', async () => {
      const { service } = serviceWith(row(25, 24));
      await expect(service.resolveCycleRange('2026-13')).rejects.toThrow(
        /Expected format YYYY-MM/,
      );
    });

    it('refuses to compute boundaries from a hand-edited out-of-range day', async () => {
      // 31 would silently roll February over into March — a wrong boundary
      // rather than an error, so it is caught before any arithmetic happens.
      const { service } = serviceWith(row(31, 30));
      await expect(service.resolveCycleRange('2026-02')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  /**
   * The lower bound of the employee write window (spec §7a rule 5). It lives
   * here rather than in `TimeEntriesService` because it is derived from
   * `AppSettings` — the same reason `resolveCycleRange()` does.
   */
  /**
   * The mirror image of `resolveWritableCycleStart` below: that one looks a
   * cycle back to decide what may still be edited, this one looks a cycle
   * forward to decide when a new rate starts applying. Both exist so their
   * callers never do cycle arithmetic of their own.
   */
  describe('resolveRateEffectiveFrom', () => {
    it('returns the start of the cycle after the one containing now', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-05T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));
        // ⭐ The reported bug, in one assertion. 5 August with a 25th boundary
        // sits inside cycle 2026-07 (25 Jul - 24 Aug), which has already been
        // priced. A raise entered today therefore starts on 25 August, leaving
        // that cycle — and every one before it — exactly as it was.
        await expect(service.resolveRateEffectiveFrom()).resolves.toEqual(
          new Date('2026-08-25T00:00:00.000Z'),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('rolls the year forward correctly at December', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-12-28T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));
        // 28 December is past the 25th, so the running cycle is 2026-12 and the
        // next one starts 25 January — a year the arithmetic must roll itself.
        await expect(service.resolveRateEffectiveFrom()).resolves.toEqual(
          new Date('2027-01-25T00:00:00.000Z'),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('moves with cycleStartDay rather than assuming the 25th', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(11, 10));
        // 3 August with an 11th boundary: running cycle is 2026-07 (11 Jul -
        // 11 Aug), so a raise today starts on 11 August.
        await expect(service.resolveRateEffectiveFrom()).resolves.toEqual(
          new Date('2026-08-11T00:00:00.000Z'),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * ⭐ The boundary a raise lands on must be the same instant the *next*
     * cycle is priced from, or a rate would take effect a cycle late (or early)
     * and nothing on screen would explain the discrepancy.
     */
    it('lands exactly on the start of the cycle that follows the current one', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-05T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));

        const effectiveFrom = await service.resolveRateEffectiveFrom();
        const { range } = await service.resolveCycleRange('2026-08');

        expect(effectiveFrom).toEqual(range.start);
      } finally {
        jest.useRealTimers();
      }
    });

    it('refuses a corrupted stored day rather than computing a wrong boundary', async () => {
      const { service } = serviceWith(row(31, 30));
      await expect(service.resolveRateEffectiveFrom()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('resolveWritableCycleStart', () => {
    it('returns the start of the cycle before the one containing now', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));
        // 3 August with a 25th boundary: the running cycle is 2026-07, so the
        // window opens where 2026-06 did — 25 June.
        await expect(service.resolveWritableCycleStart()).resolves.toEqual(
          new Date('2026-06-25T00:00:00.000Z'),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('rolls the year back correctly at January', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-03T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));
        // 3 January → running cycle 2025-12 → window opens 25 November 2025.
        await expect(service.resolveWritableCycleStart()).resolves.toEqual(
          new Date('2025-11-25T00:00:00.000Z'),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('moves with cycleStartDay rather than assuming the 25th', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(11, 10));
        // 3 August with an 11th boundary: running cycle is 2026-07 (11 Jul -
        // 11 Aug), so the window opens on 11 June.
        await expect(service.resolveWritableCycleStart()).resolves.toEqual(
          new Date('2026-06-11T00:00:00.000Z'),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * The two entry points compute the same boundary from the same field, so
     * they must not be able to disagree — and the read paths get it off
     * `resolveCycleRange()` precisely so the row is read once per request. A
     * second read is not just a wasted query: a `PUT /settings` landing between
     * them would produce one response whose cycle and whose write window came
     * from different settings.
     */
    it('agrees with the writableFrom that resolveCycleRange returns', async () => {
      const { service } = serviceWith(row(25, 24));

      const standalone = await service.resolveWritableCycleStart();
      const { writableFrom } = await service.resolveCycleRange('2026-07');

      expect(writableFrom).toEqual(standalone);
    });

    /**
     * `hasStarted` is answered here rather than by the caller, because working
     * it out means comparing a cycle boundary against the clock — and every
     * consumer of this service is forbidden to do that for itself. These are
     * the tests of the actual arithmetic; `time-entries.service.spec.ts` only
     * pins that the flag is honoured.
     */
    it('reports hasStarted true for the running cycle and for a past one', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));
        // 3 August with a 25th boundary: 2026-07 opened on 25 July.
        await expect(
          service.resolveCycleRange('2026-07'),
        ).resolves.toMatchObject({ hasStarted: true });
        await expect(
          service.resolveCycleRange('2026-05'),
        ).resolves.toMatchObject({ hasStarted: true });
      } finally {
        jest.useRealTimers();
      }
    });

    it('reports hasStarted false for a cycle whose first instant is still ahead', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));
        // 2026-08 opens on 25 August — three weeks after "now".
        await expect(
          service.resolveCycleRange('2026-08'),
        ).resolves.toMatchObject({ hasStarted: false });
      } finally {
        jest.useRealTimers();
      }
    });

    it('treats the opening instant itself as started', async () => {
      // The boundary is inclusive on this side: at exactly 25 Aug 00:00 the
      // cycle is open, which is what keeps it consistent with `range.start`
      // being the first instant *inside* it.
      jest.useFakeTimers().setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
      try {
        const { service } = serviceWith(row(25, 24));
        await expect(
          service.resolveCycleRange('2026-08'),
        ).resolves.toMatchObject({ hasStarted: true });
      } finally {
        jest.useRealTimers();
      }
    });

    it('resolveCycleRange reads the settings row exactly once', async () => {
      const { service, findUnique } = serviceWith(row(25, 24));

      await service.resolveCycleRange('2026-07');

      expect(findUnique).toHaveBeenCalledTimes(1);
    });

    it('refuses a hand-edited out-of-range day here too', async () => {
      // Same guard as resolveCycleRange: this path computes a boundary, so it
      // must not run on a day the arithmetic cannot represent honestly.
      const { service } = serviceWith(row(31, 30));
      await expect(service.resolveWritableCycleStart()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
