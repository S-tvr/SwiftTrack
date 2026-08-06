import { NotFoundException } from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import type { UsersService } from '../users/users.service';
import { Prisma, Role, type TimeEntry } from '../generated/prisma/client';

/**
 * The rules that need a database to express — §7a rule 3 (overlap), the
 * role-asymmetric open-shift block, the userId rules, and owner-or-ADMIN.
 * Rules 1, 2 and 4 live in the DTOs and are covered by
 * dto/shift-time.validator.spec.ts.
 *
 * Prisma is stubbed, following settings.service.spec.ts. ⚠️ A stub returns
 * whatever it was told, so this file cannot prove the overlap query is correct
 * SQL — the boundary case that matters most (a shift ending exactly when the
 * next begins must NOT collide) is asserted here against the *shape* of the
 * where clause, and really proved by step 8b against real rows.
 */

const ADMIN = { userId: 1, role: Role.ADMIN };
const EMPLOYEE = { userId: 2, role: Role.EMPLOYEE };

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

const shiftBody = {
  startTime: '2026-08-04T08:00:00.000Z',
  endTime: '2026-08-04T16:00:00.000Z',
};
const START = new Date(shiftBody.startTime);
const END = new Date(shiftBody.endTime);

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 10,
    userId: EMPLOYEE.userId,
    startTime: START,
    endTime: END,
    notes: null,
    createdAt: END,
    updatedAt: END,
    ...overrides,
  };
}

/**
 * Each mock is returned individually rather than reached through the stubbed
 * service, so tests never have to cast their way back to a jest.Mock.
 */
function makeService() {
  // Every findFirst call is queued in order by the tests that care; the default
  // of "nothing found" is the unblocked happy path.
  const findFirst = jest.fn().mockResolvedValue(null);
  const findMany = jest.fn().mockResolvedValue([]);
  const create = jest
    .fn()
    .mockImplementation((args: { data: Partial<TimeEntry> }) =>
      Promise.resolve(entry(args.data)),
    );
  const update = jest
    .fn()
    .mockImplementation((args: { data: Partial<TimeEntry> }) =>
      Promise.resolve(entry(args.data)),
    );
  const remove = jest.fn().mockResolvedValue(undefined);
  const assertEmployeeExists = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    timeEntry: { findFirst, findMany, create, update, delete: remove },
  } as unknown as PrismaService;
  const settings = {
    resolveCycleRange: jest
      .fn()
      .mockResolvedValue({ range: RANGE, cycleDto: CYCLE_DTO }),
  } as unknown as SettingsService;
  const users = { assertEmployeeExists } as unknown as UsersService;

  return {
    service: new TimeEntriesService(prisma, settings, users),
    findFirst,
    findMany,
    create,
    update,
    remove,
    assertEmployeeExists,
  };
}

/** The overlap predicate as it must reach Prisma, for a given new interval. */
function overlapWhere(userId: number, excludeId?: number) {
  return {
    userId,
    ...(excludeId !== undefined && { id: { not: excludeId } }),
    OR: [
      { endTime: { not: null, gt: START }, startTime: { lt: END } },
      { endTime: null, startTime: { lt: END } },
    ],
  };
}

describe('TimeEntriesService', () => {
  describe('clock-in / clock-out', () => {
    it('refuses a second clock-in with the verbatim §8a message', async () => {
      const { service, findFirst, create } = makeService();
      findFirst.mockResolvedValueOnce(entry({ endTime: null }));

      await expect(service.clockIn(EMPLOYEE.userId)).rejects.toThrow(
        'You already have an open shift. Please clock out first.',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('opens a shift with endTime null when none is open', async () => {
      const { service, create } = makeService();
      await service.clockIn(EMPLOYEE.userId);

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: EMPLOYEE.userId,
          endTime: null,
        }) as object,
      });
    });

    it('turns the index violation from a racing clock-in into the same 400', async () => {
      // Two taps close enough together that both read "no open shift" before
      // either writes. The partial unique index is what actually stops the
      // second one; the caller must not be able to tell which layer did.
      const { service, create } = makeService();
      create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.clockIn(EMPLOYEE.userId)).rejects.toThrow(
        'You already have an open shift. Please clock out first.',
      );
    });

    it('does not swallow unrelated database errors', async () => {
      const { service, create } = makeService();
      create.mockRejectedValueOnce(new Error('connection terminated'));

      await expect(service.clockIn(EMPLOYEE.userId)).rejects.toThrow(
        'connection terminated',
      );
    });

    it('refuses clock-out with no open shift, with the verbatim §8a message', async () => {
      const { service, update } = makeService();

      await expect(service.clockOut(EMPLOYEE.userId)).rejects.toThrow(
        'No open shift to clock out of.',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('closes the open shift it found, not one named by the caller', async () => {
      const { service, findFirst, update } = makeService();
      findFirst.mockResolvedValueOnce(entry({ id: 77, endTime: null }));

      await service.clockOut(EMPLOYEE.userId);

      expect(update).toHaveBeenCalledWith({
        where: { id: 77 },
        data: { endTime: expect.any(Date) as Date },
      });
    });

    it('looks the open shift up scoped to the user, never unfiltered', async () => {
      const { service, findFirst } = makeService();
      await service.findOpen(EMPLOYEE.userId);

      expect(findFirst).toHaveBeenCalledWith({
        where: { userId: EMPLOYEE.userId, endTime: null },
      });
    });

    it('answers "not clocked in" with a wrapper, never a bare null', async () => {
      // Nest sends an empty body for a nil result, which res.json() cannot
      // parse — and this endpoint's normal answer is "nothing".
      const { service } = makeService();
      await expect(service.findOpen(EMPLOYEE.userId)).resolves.toEqual({
        openShift: null,
      });
    });

    it('wraps the open shift when there is one', async () => {
      const { service, findFirst } = makeService();
      findFirst.mockResolvedValueOnce(entry({ id: 77, endTime: null }));

      const result = await service.findOpen(EMPLOYEE.userId);

      expect(result.openShift).toMatchObject({ id: 77, endTime: null });
    });
  });

  describe('userId on create (decision Δ)', () => {
    it('rejects a userId sent by an employee', async () => {
      const { service, create } = makeService();

      await expect(
        service.create(EMPLOYEE, { ...shiftBody, userId: 3 }),
      ).rejects.toThrow('userId can only be set by an admin.');
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a userId that merely matches the employee’s own id', async () => {
      // "Not yours to send" is one rule; "...unless it equals your own" is two.
      const { service } = makeService();
      await expect(
        service.create(EMPLOYEE, { ...shiftBody, userId: EMPLOYEE.userId }),
      ).rejects.toThrow('userId can only be set by an admin.');
    });

    it('writes an employee’s shift to themselves', async () => {
      const { service, create } = makeService();
      await service.create(EMPLOYEE, shiftBody);

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: EMPLOYEE.userId }) as object,
      });
    });

    it('refuses an admin create with no userId, instead of silently writing to the admin', async () => {
      const { service, create } = makeService();

      await expect(service.create(ADMIN, shiftBody)).rejects.toThrow(
        'userId is required when an admin creates a shift.',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('checks the target is an employee before writing hours to them', async () => {
      const { service, assertEmployeeExists, create } = makeService();
      await service.create(ADMIN, { ...shiftBody, userId: 5 });

      expect(assertEmployeeExists).toHaveBeenCalledWith(5);
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 5 }) as object,
      });
    });

    it('propagates the 404 when the target is not an employee', async () => {
      const { service, assertEmployeeExists, create } = makeService();
      assertEmployeeExists.mockRejectedValueOnce(
        new NotFoundException('Employee with id 1 not found.'),
      );

      await expect(
        service.create(ADMIN, { ...shiftBody, userId: 1 }),
      ).rejects.toThrow(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('the open-shift block is asymmetric by role', () => {
    it('blocks an employee from creating anything while their shift is open', async () => {
      const { service, findFirst, create } = makeService();
      findFirst.mockResolvedValueOnce(entry({ endTime: null }));

      await expect(service.create(EMPLOYEE, shiftBody)).rejects.toThrow(
        'You already have an open shift. Please clock out first.',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('blocks an employee from editing even the open row itself', async () => {
      const { service, findFirst, update } = makeService();
      const open = entry({ endTime: null });
      findFirst
        .mockResolvedValueOnce(open) // findOwnedOrThrow
        .mockResolvedValueOnce(open); // open-shift check

      await expect(
        service.update(EMPLOYEE, open.id, shiftBody),
      ).rejects.toThrow(
        'You already have an open shift. Please clock out first.',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('lets an admin close an employee’s open shift — the only tool that exists for it', async () => {
      const { service, findFirst, update } = makeService();
      const open = entry({ endTime: null });
      findFirst
        .mockResolvedValueOnce(open) // findOwnedOrThrow
        .mockResolvedValueOnce(null); // overlap check — no open-shift check runs

      await service.update(ADMIN, open.id, shiftBody);

      expect(update).toHaveBeenCalledWith({
        where: { id: open.id },
        data: expect.objectContaining({ endTime: END }) as object,
      });
    });

    it('does not block an admin from creating while the employee is on shift', async () => {
      const { service, findFirst, create } = makeService();
      await service.create(ADMIN, { ...shiftBody, userId: 5 });

      // Only the overlap check runs — the open-shift lookup is skipped entirely.
      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(findFirst).toHaveBeenCalledWith({ where: overlapWhere(5) });
      expect(create).toHaveBeenCalled();
    });

    it('checks the row owner’s state, never the caller’s', async () => {
      const { service, findFirst } = makeService();
      await service.create(EMPLOYEE, shiftBody);

      expect(findFirst).toHaveBeenNthCalledWith(1, {
        where: { userId: EMPLOYEE.userId, endTime: null },
      });
    });
  });

  describe('overlap (§7a rule 3)', () => {
    it('rejects a shift colliding with an existing one', async () => {
      const { service, findFirst, create } = makeService();
      findFirst
        .mockResolvedValueOnce(null) // no open shift
        .mockResolvedValueOnce(entry()); // a conflict

      await expect(service.create(EMPLOYEE, shiftBody)).rejects.toThrow(
        'This shift overlaps an existing shift.',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('queries with gt/lt, never gte/lte, so back-to-back shifts do not collide', async () => {
      // The one assertion standing in for real SQL until 8b: with gte/lte a
      // shift ending exactly when the next begins would be rejected, and that
      // is a perfectly ordinary pair.
      const { service, findFirst } = makeService();
      await service.create(EMPLOYEE, shiftBody);

      expect(findFirst).toHaveBeenNthCalledWith(2, {
        where: overlapWhere(EMPLOYEE.userId),
      });
    });

    it('treats an open shift as occupying [startTime, ∞)', async () => {
      const { service, findFirst } = makeService();
      await service.create(ADMIN, { ...shiftBody, userId: 5 });

      expect(findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          userId: 5,
          OR: [
            { endTime: { not: null, gt: START }, startTime: { lt: END } },
            // No upper bound on the existing row, unlike the closed branch
            // above: a running shift conflicts with anything ending after it
            // began, however long ago that was. Treating it as a point instead
            // would let an admin write inside a shift still in progress.
            { endTime: null, startTime: { lt: END } },
          ],
        },
      });
    });

    it('excludes the edited row from its own overlap check', async () => {
      const { service, findFirst } = makeService();
      findFirst
        .mockResolvedValueOnce(entry({ id: 10 })) // findOwnedOrThrow
        .mockResolvedValueOnce(null); // overlap

      await service.update(ADMIN, 10, shiftBody);

      expect(findFirst).toHaveBeenNthCalledWith(2, {
        where: overlapWhere(EMPLOYEE.userId, 10),
      });
    });

    it('runs the overlap check against the row owner when an admin edits', async () => {
      const { service, findFirst } = makeService();
      findFirst
        .mockResolvedValueOnce(entry({ id: 10, userId: 7 }))
        .mockResolvedValueOnce(null);

      await service.update(ADMIN, 10, shiftBody);

      expect(findFirst).toHaveBeenNthCalledWith(2, {
        where: overlapWhere(7, 10),
      });
    });

    it('does not check overlap on delete — removing a row cannot create one', async () => {
      const { service, findFirst, remove } = makeService();
      findFirst.mockResolvedValueOnce(entry({ id: 10 }));

      await service.remove(EMPLOYEE, 10);

      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith({ where: { id: 10 } });
    });
  });

  describe('owner-or-ADMIN', () => {
    it('folds the ownership filter into the where clause for an employee', async () => {
      const { service, findFirst } = makeService();
      findFirst.mockResolvedValueOnce(entry({ id: 10 }));

      await service.remove(EMPLOYEE, 10);

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 10, userId: EMPLOYEE.userId },
      });
    });

    it('drops the ownership filter for an admin', async () => {
      const { service, findFirst } = makeService();
      findFirst.mockResolvedValueOnce(entry({ id: 10 }));

      await service.remove(ADMIN, 10);

      expect(findFirst).toHaveBeenCalledWith({ where: { id: 10 } });
    });

    it('resolves someone else’s row to a 404, not a 403', async () => {
      const { service, findFirst, update } = makeService();
      findFirst.mockResolvedValueOnce(null);

      await expect(service.update(EMPLOYEE, 99, shiftBody)).rejects.toThrow(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('gives the same 404 on delete, so a missing row and a foreign one are indistinguishable', async () => {
      const { service, findFirst, remove } = makeService();
      findFirst.mockResolvedValueOnce(null);

      await expect(service.remove(EMPLOYEE, 99)).rejects.toThrow(
        NotFoundException,
      );
      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe('the cycle list', () => {
    it('returns the cycle block flat, alongside the entries', async () => {
      const { service } = makeService();
      const result = await service.findCycleEntries(EMPLOYEE.userId);

      expect(result).toMatchObject(CYCLE_DTO);
      expect(result.entries).toEqual([]);
    });

    it('selects open shifts by startTime and closed ones by overlap', async () => {
      // `endTime: { not: null }` alone would drop open shifts, and the approved
      // ShiftList renders an "Open" badge for exactly those.
      const { service, findMany } = makeService();
      await service.findCycleEntries(EMPLOYEE.userId, '2026-07');

      expect(findMany).toHaveBeenCalledWith({
        where: {
          userId: EMPLOYEE.userId,
          OR: [
            {
              endTime: { not: null, gt: RANGE.start },
              startTime: { lt: RANGE.endExclusive },
            },
            {
              endTime: null,
              startTime: { gte: RANGE.start, lt: RANGE.endExclusive },
            },
          ],
        },
        orderBy: { startTime: 'desc' },
      });
    });

    it('marks a shift crossing the boundary as split', async () => {
      const { service, findMany } = makeService();
      findMany.mockResolvedValueOnce([
        entry({
          startTime: new Date('2026-08-24T20:00:00.000Z'),
          endTime: new Date('2026-08-25T03:00:00.000Z'),
        }),
      ]);

      const { entries } = await service.findCycleEntries(EMPLOYEE.userId);

      // The last 3h fall in the next cycle, which is why the same row shows up
      // again when the navigator moves forward — this flag is what says so.
      expect(entries[0].isSplit).toBe(true);
    });

    it('reports an open shift as not split', async () => {
      const { service, findMany } = makeService();
      findMany.mockResolvedValueOnce([entry({ endTime: null })]);

      const { entries } = await service.findCycleEntries(EMPLOYEE.userId);

      expect(entries[0]).toMatchObject({ endTime: null, isSplit: false });
    });

    it('carries no hours figure at all — hours live only in the payroll response', async () => {
      // Under rate zones one number per shift is not what anyone is paid, so
      // this list deliberately stopped reporting one (see CycleTimeEntryDto).
      const { service, findMany } = makeService();
      findMany.mockResolvedValueOnce([entry()]);

      const { entries } = await service.findCycleEntries(EMPLOYEE.userId);

      expect(entries[0]).not.toHaveProperty('hoursInCycle');
    });

    it('404s on the admin route before listing, rather than returning an empty cycle', async () => {
      const { service, assertEmployeeExists, findMany } = makeService();
      assertEmployeeExists.mockRejectedValueOnce(
        new NotFoundException('Employee with id 99 not found.'),
      );

      await expect(
        service.findCycleEntriesForEmployee(99, '2026-07'),
      ).rejects.toThrow(NotFoundException);
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});
