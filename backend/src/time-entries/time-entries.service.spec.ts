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

/**
 * The employee write window (spec §7a rule 5) as the stub reports it: the start
 * of the cycle before RANGE. Every fixture shift below sits inside it, so tests
 * about the other rules are untouched by the lock — the rule-5 tests move this
 * instead of moving the shifts.
 */
const WRITABLE_FROM = new Date('2026-06-25T00:00:00.000Z');

/**
 * What `SettingsService.resolveCycleRange()` hands back. The defaults describe
 * an open cycle the employee may write to; the flag tests override one field
 * each, which is what keeps each of them about a single rule.
 */
const resolved = (overrides: Record<string, unknown> = {}) => ({
  range: RANGE,
  cycleDto: CYCLE_DTO,
  writableFrom: WRITABLE_FROM,
  hasStarted: true,
  ...overrides,
});

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
  // The name is derived from the id it was asked about, so a test can tell
  // "the employee being viewed" from "anyone else" — which is the mistake worth
  // catching on the admin route.
  const findEmployeeNameOrThrow = jest
    .fn()
    .mockImplementation((id: number) =>
      Promise.resolve({ id, name: `Employee ${id}` }),
    );

  const prisma = {
    timeEntry: { findFirst, findMany, create, update, delete: remove },
  } as unknown as PrismaService;
  // The write floor and "has this cycle opened?" ride along with the cycle:
  // all three come from one reading of `cycleStartDay` and one reading of the
  // clock, so the read paths take them from here and only the write paths call
  // resolveWritableCycleStart().
  const resolveCycleRange = jest.fn().mockResolvedValue(resolved());
  const resolveWritableCycleStart = jest.fn().mockResolvedValue(WRITABLE_FROM);
  const settings = {
    resolveCycleRange,
    resolveWritableCycleStart,
  } as unknown as SettingsService;
  const users = {
    assertEmployeeExists,
    findEmployeeNameOrThrow,
  } as unknown as UsersService;

  return {
    service: new TimeEntriesService(prisma, settings, users),
    findFirst,
    findMany,
    create,
    update,
    remove,
    assertEmployeeExists,
    findEmployeeNameOrThrow,
    resolveCycleRange,
    resolveWritableCycleStart,
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

  /**
   * Rule 5 differs from 1-4 in scope: it covers DELETE as well, and it is about
   * *when* a shift may be written rather than what a valid one looks like.
   *
   * Every fixture here sits inside WRITABLE_FROM, so a locked case is expressed
   * by moving the shift before it rather than by moving the window.
   */
  describe('the cycle lock (§7a rule 5)', () => {
    const LOCKED = {
      startTime: '2026-05-04T08:00:00.000Z',
      endTime: '2026-05-04T16:00:00.000Z',
    };
    const LOCKED_MESSAGE =
      'That pay cycle is closed. You can only change shifts in your current or previous cycle.';

    it('refuses an employee creating a shift in a closed cycle', async () => {
      const { service, create } = makeService();

      await expect(service.create(EMPLOYEE, LOCKED)).rejects.toThrow(
        LOCKED_MESSAGE,
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('runs before the open-shift block, so the refusal names the fixable thing', async () => {
      // Both rules are violated. The employee can act on "pick another date";
      // they cannot act on "clock out" to make an old cycle writable again.
      const { service, findFirst } = makeService();
      findFirst.mockResolvedValueOnce(entry({ endTime: null }));

      await expect(service.create(EMPLOYEE, LOCKED)).rejects.toThrow(
        LOCKED_MESSAGE,
      );
    });

    it('lets an employee create inside the window', async () => {
      const { service, create } = makeService();
      await service.create(EMPLOYEE, shiftBody);

      expect(create).toHaveBeenCalled();
    });

    it('refuses an employee dragging a locked row forward into the window', async () => {
      // Only the NEW value is inside. Checking that alone would let a paid
      // cycle be emptied one shift at a time.
      const { service, findFirst, update } = makeService();
      findFirst.mockResolvedValueOnce(
        entry({ startTime: new Date(LOCKED.startTime) }),
      );

      await expect(service.update(EMPLOYEE, 10, shiftBody)).rejects.toThrow(
        LOCKED_MESSAGE,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses an employee pushing a current row back into a closed cycle', async () => {
      // Only the EXISTING row is inside. The mirror image of the case above,
      // and one check catches only one of them.
      const { service, findFirst, update } = makeService();
      findFirst.mockResolvedValueOnce(entry()); // findOwnedOrThrow — inside

      await expect(service.update(EMPLOYEE, 10, LOCKED)).rejects.toThrow(
        LOCKED_MESSAGE,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses an employee deleting from a closed cycle', async () => {
      const { service, findFirst, remove } = makeService();
      findFirst.mockResolvedValueOnce(
        entry({ startTime: new Date(LOCKED.startTime) }),
      );

      await expect(service.remove(EMPLOYEE, 10)).rejects.toThrow(
        LOCKED_MESSAGE,
      );
      expect(remove).not.toHaveBeenCalled();
    });

    it('exempts an admin on all three writes, without even resolving the window', async () => {
      // The exemption is not a comparison that happens to pass — the boundary
      // is never looked up, which is what keeps it true regardless of the date.
      const {
        service,
        findFirst,
        create,
        update,
        remove,
        resolveWritableCycleStart,
      } = makeService();
      const lockedRow = entry({ startTime: new Date(LOCKED.startTime) });
      findFirst
        .mockResolvedValueOnce(null) // create: overlap check
        .mockResolvedValueOnce(lockedRow) // update: findOwnedOrThrow
        .mockResolvedValueOnce(null) // update: overlap check
        .mockResolvedValueOnce(lockedRow); // remove: findOwnedOrThrow

      await service.create(ADMIN, { ...LOCKED, userId: 5 });
      await service.update(ADMIN, 10, LOCKED);
      await service.remove(ADMIN, 10);

      expect(create).toHaveBeenCalled();
      expect(update).toHaveBeenCalled();
      expect(remove).toHaveBeenCalled();
      expect(resolveWritableCycleStart).not.toHaveBeenCalled();
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
      const result = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      expect(result).toMatchObject(CYCLE_DTO);
      expect(result.entries).toEqual([]);
    });

    /**
     * Step 8d. The admin's /shifts/:userId and /payroll/:userId are twin pages
     * for the same third person, and payroll has carried userId/name since step
     * 6 — so without these the same admin got a name on one page and not the
     * other, and this one would have needed a second call to GET /users (the
     * whole team, every pending setupCode included) to print one label.
     */
    it('says whose list it is, on the employee route too', async () => {
      // Returned on /me as well, where the page never prints it: one shape for
      // both routes is what the shared ShiftList consumes without branching.
      const { service, findEmployeeNameOrThrow } = makeService();

      const result = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      expect(findEmployeeNameOrThrow).toHaveBeenCalledWith(EMPLOYEE.userId);
      expect(result).toMatchObject({
        userId: EMPLOYEE.userId,
        name: `Employee ${EMPLOYEE.userId}`,
      });
    });

    /**
     * ⭐ The one that catches the obvious mistake — labelling the admin's own
     * name onto someone else's list.
     */
    it('names the employee being viewed on the admin route, not the caller', async () => {
      const { service, findEmployeeNameOrThrow } = makeService();

      const result = await service.findCycleEntriesForEmployee(5, '2026-07');

      expect(findEmployeeNameOrThrow).toHaveBeenCalledWith(5);
      expect(result).toMatchObject({ userId: 5, name: 'Employee 5' });
    });

    it('costs the admin route no extra query — the name lookup replaces the existence check', async () => {
      // The reader throws the same 404 assertEmployeeExists did, so calling
      // both would be two round trips for one question.
      const { service, findEmployeeNameOrThrow, assertEmployeeExists } =
        makeService();

      await service.findCycleEntriesForEmployee(5, '2026-07');

      expect(findEmployeeNameOrThrow).toHaveBeenCalledTimes(1);
      expect(assertEmployeeExists).not.toHaveBeenCalled();
    });

    it('selects open shifts by startTime and closed ones by overlap', async () => {
      // `endTime: { not: null }` alone would drop open shifts, and the approved
      // ShiftList renders an "Open" badge for exactly those.
      const { service, findMany } = makeService();
      await service.findCycleEntries(EMPLOYEE.userId, EMPLOYEE.role, '2026-07');

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

      const { entries } = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      // The last 3h fall in the next cycle, which is why the same row shows up
      // again when the navigator moves forward — this flag is what says so.
      expect(entries[0].isSplit).toBe(true);
    });

    it('reports an open shift as not split', async () => {
      const { service, findMany } = makeService();
      findMany.mockResolvedValueOnce([entry({ endTime: null })]);

      const { entries } = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      expect(entries[0]).toMatchObject({ endTime: null, isSplit: false });
    });

    it('carries no hours figure at all — hours live only in the payroll response', async () => {
      // Under rate zones one number per shift is not what anyone is paid, so
      // this list deliberately stopped reporting one (see CycleTimeEntryDto).
      const { service, findMany } = makeService();
      findMany.mockResolvedValueOnce([entry()]);

      const { entries } = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      expect(entries[0]).not.toHaveProperty('hoursInCycle');
    });

    /**
     * The list needs two things off `AppSettings` — the cycle and the write
     * window — and asking for them separately meant reading the singleton row
     * twice per request. `resolveCycleRange()` now returns both from one read,
     * so `resolveWritableCycleStart()` belongs only to the write paths.
     */
    it('resolves the cycle and the write window in a single settings call', async () => {
      const { service, resolveCycleRange, resolveWritableCycleStart } =
        makeService();

      await service.findCycleEntries(EMPLOYEE.userId, EMPLOYEE.role);

      expect(resolveCycleRange).toHaveBeenCalledTimes(1);
      expect(resolveWritableCycleStart).not.toHaveBeenCalled();
    });

    it('reports canWrite and canEdit for an employee inside the window', async () => {
      const { service, findMany } = makeService();
      findMany.mockResolvedValueOnce([entry()]);

      const result = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      expect(result.canWrite).toBe(true);
      expect(result.entries[0].canEdit).toBe(true);
    });

    it('reports canWrite false for an employee looking at a closed cycle', async () => {
      // The flag a POST needs: there is no row for it to hang one on, so
      // without this the employee fills the form and meets an unanticipated 400.
      const { service, findMany, resolveCycleRange } = makeService();
      resolveCycleRange.mockResolvedValueOnce(
        resolved({ writableFrom: new Date('2026-09-25T00:00:00.000Z') }),
      );
      findMany.mockResolvedValueOnce([entry()]);

      const result = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      expect(result.canWrite).toBe(false);
      expect(result.entries[0].canEdit).toBe(false);
    });

    /**
     * The **upper** bound of `canWrite`, which the test above cannot reach: it
     * moves the writable floor, so it only ever exercises the lower one.
     *
     * A cycle can be unwritable in two directions. Rule 5 closes the past, and
     * rule 4 ("no timestamp after now") closes the future — the ◀▶ navigator
     * can reach a cycle that has not opened yet, and "Add Shift" has to be
     * disabled there too, or the employee fills in a form whose every value is
     * refused by a `ValidationPipe` 400 that carries no code to explain itself.
     */
    it('reports canWrite false for a cycle that has not started yet', async () => {
      // The write floor still passes here, so only `hasStarted` can decide it.
      // The arithmetic behind that flag is SettingsService's, and is tested
      // against a real clock there; what this pins is that the flag is honoured
      // rather than recomputed — this service reads no clock of its own.
      const { service, resolveCycleRange } = makeService();
      resolveCycleRange.mockResolvedValueOnce(resolved({ hasStarted: false }));

      const result = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      expect(result.canWrite).toBe(false);
    });

    it('anchors canEdit on startTime, so a split shift from a closed cycle stays locked', async () => {
      // It runs into the window but began before it, and part of it was paid in
      // the closed cycle — so the row does not become editable by extending.
      const { service, findMany, resolveCycleRange } = makeService();
      resolveCycleRange.mockResolvedValueOnce(
        resolved({ writableFrom: RANGE.start }),
      );
      findMany.mockResolvedValueOnce([
        entry({
          startTime: new Date('2026-07-24T20:00:00.000Z'),
          endTime: new Date('2026-07-25T03:00:00.000Z'),
        }),
      ]);

      const { entries } = await service.findCycleEntries(
        EMPLOYEE.userId,
        EMPLOYEE.role,
      );

      expect(entries[0].isSplit).toBe(true);
      expect(entries[0].canEdit).toBe(false);
    });

    it('reports both flags true for an admin, whatever the window says', async () => {
      // Keeps one response shape for both routes, as §5 requires. The floor is
      // set far in the future and the row far in the past, so both flags would
      // be false for an employee — the admin ignores it rather than happening
      // to satisfy it.
      const { service, findMany, resolveCycleRange } = makeService();
      resolveCycleRange.mockResolvedValueOnce(
        resolved({ writableFrom: new Date('2030-01-01T00:00:00.000Z') }),
      );
      findMany.mockResolvedValueOnce([
        entry({ startTime: new Date('2020-01-01T08:00:00.000Z') }),
      ]);

      const result = await service.findCycleEntriesForEmployee(5, '2026-07');

      expect(result.canWrite).toBe(true);
      expect(result.entries[0].canEdit).toBe(true);
    });

    it('404s on the admin route before listing, rather than returning an empty cycle', async () => {
      const { service, findEmployeeNameOrThrow, findMany, resolveCycleRange } =
        makeService();
      findEmployeeNameOrThrow.mockRejectedValueOnce(
        new NotFoundException('Employee with id 99 not found.'),
      );

      await expect(
        service.findCycleEntriesForEmployee(99, '2026-07'),
      ).rejects.toThrow(NotFoundException);
      expect(findMany).not.toHaveBeenCalled();
      // Also before the cycle is resolved, which is what keeps a bad id
      // answering 404 rather than racing a malformed ?cycle= for the 400.
      expect(resolveCycleRange).not.toHaveBeenCalled();
    });
  });
});
