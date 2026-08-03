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
} {
  const update = jest.fn();
  const prisma = {
    appSettings: {
      findUnique: jest.fn().mockResolvedValue(row),
      update,
    },
  } as unknown as PrismaService;
  return { service: new SettingsService(prisma), update };
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
});
