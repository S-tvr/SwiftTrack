import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { Prisma, Role, type User } from '../generated/prisma/client';

/**
 * `UsersService` is the single owner of every `User` query (an invariant), so
 * these cover the rules that would otherwise only be enforced by whoever
 * remembered them at the call site: the ADMIN rows that must stay out of reach,
 * the two fields that have to be cleared together, and the DTO boundary that
 * decides whether a setup code leaves the building.
 *
 * Messages are asserted verbatim, as everywhere else in the suite.
 *
 * Prisma is stubbed — the real SQL and the unique index behind the 409 are
 * covered by the e2e suite (step 8b), which is the only place they can be.
 */

const DUPLICATE_EMAIL = 'A user with this email already exists.';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 7,
    name: 'Jane Employee',
    email: 'jane@example.com',
    password: null,
    role: Role.EMPLOYEE,
    hourlyRate: 2450,
    isActive: true,
    setupCode: '4321',
    setupCodeExpiresAt: new Date('2026-01-04T00:00:00.000Z'),
    tokenVersion: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** The start of the cycle after the current one — what a raise is dated to. */
const NEXT_CYCLE_START = new Date('2026-08-25T00:00:00.000Z');
/** The start of a cycle being priced — what a rate is resolved *at*. */
const CYCLE_START = new Date('2026-07-25T00:00:00.000Z');
/** Mirrors the constant in the service. */
const RATE_EPOCH = new Date(0);

function makeService() {
  const user = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makeUser()),
    update: jest.fn().mockResolvedValue(makeUser()),
  };
  const userRate = {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
  };
  // The array form resolves each promise it is handed. The stubs above are
  // already resolved values, so awaiting them here reproduces what Prisma does
  // without pretending to be a real transaction — what these tests assert is
  // that both writes are handed over *together*, which the call itself shows.
  const $transaction = jest
    .fn()
    .mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  const prisma = { user, userRate, $transaction } as unknown as PrismaService;
  const resolveRateEffectiveFrom = jest
    .fn()
    .mockResolvedValue(NEXT_CYCLE_START);
  const settings = {
    resolveRateEffectiveFrom,
  } as unknown as SettingsService;

  return {
    service: new UsersService(prisma, settings),
    user,
    userRate,
    $transaction,
    resolveRateEffectiveFrom,
  };
}

describe('UsersService', () => {
  describe('ADMIN rows are out of reach of update and deactivate', () => {
    /**
     * ⭐ Both reasons are load-bearing: an admin has no `hourlyRate` by design,
     * and deactivating the only admin is unrecoverable through the API — login
     * checks `isActive`, there is no public register route, and `reactivate()`
     * is no escape hatch because it runs through this same EMPLOYEE-only lookup.
     */
    it('404s instead of writing, and never issues the update', async () => {
      for (const call of [
        (s: UsersService) => s.updateEmployee(1, { name: 'Renamed' }),
        (s: UsersService) => s.deactivate(1),
        (s: UsersService) => s.reactivate(1),
        (s: UsersService) => s.resetSetupCode(1),
        (s: UsersService) => s.resetPassword(1),
      ]) {
        const { service, user } = makeService();
        // The lookup filters on role, so an ADMIN id resolves to null.
        user.findFirst.mockResolvedValue(null);

        await expect(call(service)).rejects.toThrow(
          'Employee with id 1 not found.',
        );
        await expect(call(service)).rejects.toBeInstanceOf(NotFoundException);
        expect(user.update).not.toHaveBeenCalled();
      }
    });

    it('scopes the lookup to EMPLOYEE rather than filtering afterwards', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(makeUser());

      await service.deactivate(7);

      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 7, role: 'EMPLOYEE' },
      });
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { isActive: false },
      });
    });
  });

  /**
   * The two recovery paths added in step 8c. Before them, deactivation was
   * irreversible through the API and an expired setup code was a permanent
   * lockout — both routine situations with no remedy short of editing the
   * database by hand.
   */
  describe('the recovery endpoints', () => {
    it('reactivates by setting isActive true, and nothing else', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(makeUser({ isActive: false }));

      await service.reactivate(7);

      expect(user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { isActive: true },
      });
    });

    it('treats reactivating an already-active employee as a no-op, not a conflict', async () => {
      // The button only renders on a deactivated row, so the only way here is a
      // double submit — where "they are active" is the outcome that was asked
      // for. Contrast resetSetupCode below, where a repeat is not harmless.
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(makeUser({ isActive: true }));

      await expect(service.reactivate(7)).resolves.toMatchObject({ id: 7 });
    });

    it('issues a fresh 4-digit code and a fresh 3-day expiry', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(makeUser({ setupCode: '0001' }));
      const before = Date.now();

      await service.resetSetupCode(7);

      const [firstCall] = user.update.mock.calls as Array<
        [{ data: { setupCode: string; setupCodeExpiresAt: Date } }]
      >;
      const { data } = firstCall[0];
      expect(data.setupCode).toMatch(/^\d{4}$/);
      expect(data.setupCode).not.toBe('0001');
      // Both fields are rewritten together: a new code with the old expiry
      // would still be dead on arrival.
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      expect(data.setupCodeExpiresAt.getTime()).toBeGreaterThanOrEqual(
        before + threeDays - 1000,
      );
    });

    it('refuses to re-issue a code for an account that has already activated', async () => {
      // A code is the secret that unlocks an unactivated account. Writing a new
      // one onto an account that no longer needs it creates a way in that
      // nobody asked for.
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(makeUser({ password: 'hashed' }));

      await expect(service.resetSetupCode(7)).rejects.toThrow(
        'This account has already been activated.',
      );
      expect(user.update).not.toHaveBeenCalled();
    });
  });

  /**
   * The mirror image of resetSetupCode: that one refuses once a password
   * exists· this one exists because one does, for an employee who forgot it.
   * No guard on activation or active state — added in step 8g.
   */
  describe('resetPassword', () => {
    it('nulls the password, issues a fresh code, and revokes existing sessions', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(
        makeUser({ password: 'hashed', setupCode: null, tokenVersion: 2 }),
      );
      const before = Date.now();

      await service.resetPassword(7);

      const [firstCall] = user.update.mock.calls as Array<
        [
          {
            where: { id: number };
            data: {
              password: null;
              setupCode: string;
              setupCodeExpiresAt: Date;
              tokenVersion: { increment: number };
            };
          },
        ]
      >;
      const { where, data } = firstCall[0];
      expect(where).toEqual({ id: 7 });
      expect(data.password).toBeNull();
      expect(data.setupCode).toMatch(/^\d{4}$/);
      expect(data.tokenVersion).toEqual({ increment: 1 });
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      expect(data.setupCodeExpiresAt.getTime()).toBeGreaterThanOrEqual(
        before + threeDays - 1000,
      );
    });

    it('succeeds on a still-pending employee, overlapping resetSetupCode on purpose', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(makeUser({ password: null }));

      await expect(service.resetPassword(7)).resolves.toMatchObject({
        id: 7,
      });
      expect(user.update).toHaveBeenCalled();
    });

    it('succeeds on a deactivated employee without touching isActive', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(
        makeUser({ password: 'hashed', isActive: false }),
      );

      await service.resetPassword(7);

      const [firstCall] = user.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(firstCall[0].data).not.toHaveProperty('isActive');
    });
  });

  describe('createEmployee', () => {
    it('creates without a password and with a 4-digit code expiring in 3 days', async () => {
      const { service, user } = makeService();

      await service.createEmployee({
        name: 'Jane',
        email: 'jane@example.com',
        hourlyRate: 2450,
      });

      const [firstCall] = user.create.mock.calls as Array<
        [
          {
            data: {
              password: null;
              role: string;
              setupCode: string;
              setupCodeExpiresAt: Date;
            };
          },
        ]
      >;
      const { data } = firstCall[0];
      expect(data.password).toBeNull();
      expect(data.role).toBe('EMPLOYEE');
      expect(data.setupCode).toMatch(/^\d{4}$/);

      const daysAhead =
        (data.setupCodeExpiresAt.getTime() - Date.now()) / 86_400_000;
      expect(daysAhead).toBeGreaterThan(2.9);
      expect(daysAhead).toBeLessThan(3.1);
    });

    /**
     * ⭐ The rate row is created with the employee, at the epoch. Not tidiness:
     * an admin may write a shift at any past date, so a cycle earlier than this
     * row is reachable — and a cycle with no rate in force makes payroll throw,
     * which on the team overview takes down the page for everyone. Writing it
     * in the same statement is what stops the two from ever existing apart.
     */
    it('writes the first rate row alongside the user, effective from the epoch', async () => {
      const { service, user } = makeService();

      await service.createEmployee({
        name: 'Jane',
        email: 'jane@example.com',
        hourlyRate: 2450,
      });

      const [firstCall] = user.create.mock.calls as Array<
        [
          {
            data: {
              hourlyRate: number;
              rates: { create: { hourlyRate: number; effectiveFrom: Date } };
            };
          },
        ]
      >;
      const { data } = firstCall[0];
      // Both halves, in one write: the denormalised head and the history.
      expect(data.hourlyRate).toBe(2450);
      expect(data.rates.create).toEqual({
        hourlyRate: 2450,
        effectiveFrom: RATE_EPOCH,
      });
    });

    it('409s on the explicit pre-check, without attempting the insert', async () => {
      const { service, user } = makeService();
      user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.createEmployee({
          name: 'Jane',
          email: 'jane@example.com',
          hourlyRate: 2450,
        }),
      ).rejects.toThrow(DUPLICATE_EMAIL);
      expect(user.create).not.toHaveBeenCalled();
    });

    /**
     * ⭐ The pre-check is check-then-act, so two concurrent creates can both
     * pass it. The DB unique index is the real guarantee — its violation has to
     * surface as the same 409, not as an unhandled 500.
     */
    it('409s on a P2002 from the database, with the same message', async () => {
      const { service, user } = makeService();
      user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.9.1',
        }),
      );

      const error = await service
        .createEmployee({
          name: 'Jane',
          email: 'jane@example.com',
          hourlyRate: 2450,
        })
        .catch((e: Error) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(DUPLICATE_EMAIL);
    });

    it('rethrows any other database error instead of swallowing it', async () => {
      const { service, user } = makeService();
      user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Connection lost', {
          code: 'P1001',
          clientVersion: '7.9.1',
        }),
      );

      // A catch-all here would turn an outage into "email already exists",
      // which is both wrong and unactionable.
      await expect(
        service.createEmployee({
          name: 'Jane',
          email: 'jane@example.com',
          hourlyRate: 2450,
        }),
      ).rejects.toThrow('Connection lost');
    });
  });

  /**
   * ⭐ A setup code that outlives activation is a second, permanent password.
   * The two fields are cleared together or not at all.
   */
  it('activateAccount clears setupCode and setupCodeExpiresAt together', async () => {
    const { service, user } = makeService();

    await service.activateAccount('jane@example.com', 'hashed-password');

    expect(user.update).toHaveBeenCalledWith({
      where: { email: 'jane@example.com' },
      data: {
        password: 'hashed-password',
        setupCode: null,
        setupCodeExpiresAt: null,
      },
    });
  });

  /**
   * A raise is forward-effective: it is dated to the start of the *next* cycle,
   * so the cycle in progress and every past one keep the rate they were priced
   * at. Before `UserRate` existed, changing this field silently repriced every
   * cycle the employee had ever worked.
   */
  describe('updateEmployee and the rate history', () => {
    it('dates a changed rate to the next cycle and writes both halves together', async () => {
      const {
        service,
        user,
        userRate,
        $transaction,
        resolveRateEffectiveFrom,
      } = makeService();
      // The row as it stands: 2450. The raise is to 2800.
      user.findFirst.mockResolvedValue(makeUser({ hourlyRate: 2450 }));

      await service.updateEmployee(7, { hourlyRate: 2800 });

      expect(resolveRateEffectiveFrom).toHaveBeenCalledTimes(1);
      expect(userRate.upsert).toHaveBeenCalledWith({
        where: {
          userId_effectiveFrom: { userId: 7, effectiveFrom: NEXT_CYCLE_START },
        },
        update: { hourlyRate: 2800 },
        create: {
          userId: 7,
          hourlyRate: 2800,
          effectiveFrom: NEXT_CYCLE_START,
        },
      });
      // ⭐ One transaction, both writes. A reader that saw the updated column
      // without the history row would report a rate nobody is paid.
      expect($transaction).toHaveBeenCalledTimes(1);
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { hourlyRate: 2800 },
      });
    });

    /**
     * ⭐ Not an optimisation. `EmployeeForm` submits both fields on every save,
     * so without this a rename would write a rate row each time — and a row
     * dated to the next cycle is not inert: it is what that cycle gets priced
     * with.
     */
    it('writes no rate row when the submitted rate is unchanged', async () => {
      const {
        service,
        user,
        userRate,
        $transaction,
        resolveRateEffectiveFrom,
      } = makeService();
      user.findFirst.mockResolvedValue(makeUser({ hourlyRate: 2450 }));

      await service.updateEmployee(7, {
        name: 'Jane Renamed',
        hourlyRate: 2450,
      });

      expect(userRate.upsert).not.toHaveBeenCalled();
      expect($transaction).not.toHaveBeenCalled();
      // The cycle is not even resolved — there is nothing to date.
      expect(resolveRateEffectiveFrom).not.toHaveBeenCalled();
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { name: 'Jane Renamed', hourlyRate: 2450 },
      });
    });

    it('leaves the rate history alone for a name-only edit', async () => {
      const { service, user, userRate } = makeService();
      user.findFirst.mockResolvedValue(makeUser({ hourlyRate: 2450 }));

      await service.updateEmployee(7, { name: 'Jane Renamed' });

      expect(userRate.upsert).not.toHaveBeenCalled();
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { name: 'Jane Renamed' },
      });
    });

    /**
     * ⭐ Two raises inside one cycle target the same `(userId, effectiveFrom)`,
     * which the unique constraint would refuse. Upserting means the second one
     * replaces the first instead of failing — so a typo stays correctable right
     * up until the cycle it applies to begins.
     */
    it('upserts rather than inserts, so a second raise in the same cycle replaces the first', async () => {
      const { service, user, userRate } = makeService();
      user.findFirst.mockResolvedValue(makeUser({ hourlyRate: 2450 }));

      await service.updateEmployee(7, { hourlyRate: 2800 });
      user.findFirst.mockResolvedValue(makeUser({ hourlyRate: 2800 }));
      await service.updateEmployee(7, { hourlyRate: 3000 });

      expect(userRate.upsert).toHaveBeenCalledTimes(2);
      const [, secondCall] = userRate.upsert.mock.calls as Array<
        [{ where: unknown; update: { hourlyRate: number } }]
      >;
      expect(secondCall[0].where).toEqual({
        userId_effectiveFrom: { userId: 7, effectiveFrom: NEXT_CYCLE_START },
      });
      expect(secondCall[0].update).toEqual({ hourlyRate: 3000 });
    });
  });

  describe('the DTO trust boundary', () => {
    /**
     * ⭐ `UserProfileDto` is the user's view of themselves and must never carry
     * the code that unlocks an unactivated account. This project has leaked
     * exactly that twice already (the removed `findById()` in step 2, the
     * reused response DTO in step 3).
     */
    it('toProfileDto carries no setupCode, isActive or hasActivated', () => {
      const { service } = makeService();

      const profile = service.toProfileDto(makeUser());

      expect(profile).toEqual({
        id: 7,
        name: 'Jane Employee',
        email: 'jane@example.com',
        role: Role.EMPLOYEE,
        hourlyRate: 2450,
      });
      expect(profile).not.toHaveProperty('setupCode');
      expect(profile).not.toHaveProperty('setupCodeExpiresAt');
    });

    /**
     * The mirror image: the admin's view of other people **must** carry it —
     * spec §5 has the admin hand the code to the employee out of band, so
     * omitting it breaks activation entirely.
     */
    it('the admin-facing DTO carries setupCode and the derived hasActivated', async () => {
      const { service, user } = makeService();
      user.findMany.mockResolvedValue([
        makeUser({ id: 1, password: null, setupCode: '4321' }),
        makeUser({ id: 2, password: 'hashed', setupCode: null }),
      ]);

      const [pending, activated] = await service.findAllEmployees();

      expect(pending.setupCode).toBe('4321');
      expect(pending.hasActivated).toBe(false);
      expect(activated.setupCode).toBeNull();
      expect(activated.hasActivated).toBe(true);
    });

    /**
     * The expiry travels with the code, because the Team page prints a date
     * ("Valid until 29 August") rather than a duration — in the dialog shown
     * after creating an employee and on every pending row, so an admin can see
     * one about to lapse. A code without its expiry cannot be presented that
     * way, and this is the same class of gap as the code itself being missing.
     */
    it('carries setupCodeExpiresAt as an ISO string beside the code', async () => {
      const { service, user } = makeService();
      user.findMany.mockResolvedValue([
        makeUser({ id: 1, password: null }),
        // Activated: both fields were cleared together, as activateAccount does.
        makeUser({
          id: 2,
          password: 'hashed',
          setupCode: null,
          setupCodeExpiresAt: null,
        }),
      ]);

      const [pending, activated] = await service.findAllEmployees();

      expect(pending.setupCodeExpiresAt).toBe('2026-01-04T00:00:00.000Z');
      // Null in exactly the cases the code is — never one without the other.
      expect(activated.setupCode).toBeNull();
      expect(activated.setupCodeExpiresAt).toBeNull();
    });

    it('findAllEmployees never returns the admin', async () => {
      const { service, user } = makeService();

      await service.findAllEmployees();

      expect(user.findMany).toHaveBeenCalledWith({
        where: { role: 'EMPLOYEE' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('the narrow cross-service readers', () => {
    /**
     * ⭐ `findActiveById` runs on **every authenticated request** (JwtStrategy).
     * Loading the whole row would pull `password` and `setupCode` into memory
     * that often, which is why the explicit `select` is part of the contract
     * rather than an optimisation.
     */
    it('findActiveById selects only id, role and tokenVersion, and requires isActive', async () => {
      const { service, user } = makeService();

      await service.findActiveById(7);

      // tokenVersion joined the three in step 8f: JwtStrategy compares it
      // against the token on every request, which is what makes a password
      // change able to revoke sessions without a second query.
      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 7, isActive: true },
        select: { id: true, role: true, tokenVersion: true },
      });
    });

    it('assertEmployeeExists 404s a non-EMPLOYEE id and selects only the id', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(null);

      await expect(service.assertEmployeeExists(1)).rejects.toThrow(
        'Employee with id 1 not found.',
      );
      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 1, role: Role.EMPLOYEE },
        select: { id: true },
      });
    });

    /**
     * The shift list's counterpart to `findEmployeeRateAt`. It answers "whose
     * list is this?" in the same query that proves the id is an employee at
     * all, which is why the admin list route dropped `assertEmployeeExists`
     * rather than calling both.
     */
    it('findEmployeeNameOrThrow returns id and name, and selects nothing else', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 7, name: 'Jane Employee' });

      await expect(service.findEmployeeNameOrThrow(7)).resolves.toEqual({
        id: 7,
        name: 'Jane Employee',
      });
      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 7, role: Role.EMPLOYEE },
        select: { id: true, name: true },
      });
    });

    it('findEmployeeNameOrThrow 404s an ADMIN id and an unknown one alike', async () => {
      // The role filter is what collapses the two: an admin has no shifts of
      // their own, so an empty cycle for their id would be a lie, not a list.
      for (const id of [1, 999]) {
        const { service, user } = makeService();
        user.findFirst.mockResolvedValue(null);

        await expect(service.findEmployeeNameOrThrow(id)).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.findEmployeeNameOrThrow(id)).rejects.toThrow(
          `Employee with id ${id} not found.`,
        );
      }
    });

    /**
     * ⭐ No `isActive` in the `where`, deliberately: the admin has to be able to
     * read and repair the history of someone who has left — including the open
     * shift they can no longer log in to close. A stub cannot prove absence of a
     * filter by behaving differently, so what is pinned is the query itself; the
     * outcome against real rows is asserted in time-entries.e2e-spec.ts.
     */
    it('findEmployeeNameOrThrow does not filter on isActive, so a departed employee still resolves', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 7, name: 'Departed Employee' });

      await expect(service.findEmployeeNameOrThrow(7)).resolves.toEqual({
        id: 7,
        name: 'Departed Employee',
      });
      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 7, role: Role.EMPLOYEE },
        select: { id: true, name: true },
      });
    });

    it('findEmployeeRateAt returns null for a non-EMPLOYEE and never loads secrets', async () => {
      const { service, user, userRate } = makeService();
      user.findFirst.mockResolvedValue(null);

      await expect(
        service.findEmployeeRateAt(1, CYCLE_START),
      ).resolves.toBeNull();
      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 1, role: Role.EMPLOYEE },
        select: { id: true, name: true },
      });
      // No employee, no rate lookup — the second query is not merely unused,
      // it is never issued.
      expect(userRate.findFirst).not.toHaveBeenCalled();
    });

    /**
     * ⭐ The bug this table exists to fix, in one test. An employee with two
     * rates — one from the epoch, one starting *after* the cycle being priced —
     * must be paid the older one. Reading "the newest rate" instead is exactly
     * what repriced every past cycle whenever somebody got a raise.
     */
    it('findEmployeeRateAt asks for the newest rate at or before the instant, not the newest overall', async () => {
      const { service, user, userRate } = makeService();
      user.findFirst.mockResolvedValue({ id: 7, name: 'Jane Employee' });
      userRate.findFirst.mockResolvedValue({ hourlyRate: 2450 });

      await expect(service.findEmployeeRateAt(7, CYCLE_START)).resolves.toEqual(
        {
          id: 7,
          name: 'Jane Employee',
          hourlyRate: 2450,
        },
      );
      expect(userRate.findFirst).toHaveBeenCalledWith({
        where: { userId: 7, effectiveFrom: { lte: CYCLE_START } },
        orderBy: { effectiveFrom: 'desc' },
        select: { hourlyRate: true },
      });
    });

    /**
     * Left null rather than defaulted to 0 — `PayrollService` turns this into a
     * loud 500. A silent 0 would drop somebody's wages out of the team total,
     * which is the money nobody notices is missing.
     */
    it('findEmployeeRateAt reports a null rate when none is in force yet', async () => {
      const { service, user, userRate } = makeService();
      user.findFirst.mockResolvedValue({ id: 7, name: 'Jane Employee' });
      userRate.findFirst.mockResolvedValue(null);

      await expect(service.findEmployeeRateAt(7, CYCLE_START)).resolves.toEqual(
        {
          id: 7,
          name: 'Jane Employee',
          hourlyRate: null,
        },
      );
    });

    /**
     * Deliberately a batch reader: fifteen employees through
     * `findEmployeeRateAt()` in a loop would be thirty round trips on a page
     * that should cost one. `isActive` comes back so the caller can apply its
     * own rule about who belongs on the overview for a given cycle.
     */
    it('findAllEmployeeRatesAt fetches the team in one query, active flag included', async () => {
      const { service, user } = makeService();
      user.findMany.mockResolvedValue([
        { id: 7, name: 'Jane Employee', isActive: true },
      ]);

      await service.findAllEmployeeRatesAt(CYCLE_START);

      expect(user.findMany).toHaveBeenCalledTimes(1);
      expect(user.findMany).toHaveBeenCalledWith({
        where: { role: Role.EMPLOYEE },
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' },
      });
    });

    /**
     * ⭐ The N+1 guard, asserted rather than commented. Three employees must
     * still cost exactly two queries — one for the people, one for every rate
     * row in force — with the fold happening in memory. A loop would pass every
     * other test in this file and only show up as a slow page.
     */
    it('findAllEmployeeRatesAt stays at two queries regardless of headcount, and picks the rate in force per person', async () => {
      const { service, user, userRate } = makeService();
      user.findMany.mockResolvedValue([
        { id: 7, name: 'Jane', isActive: true },
        { id: 8, name: 'Karl', isActive: false },
        { id: 9, name: 'Lars', isActive: true },
      ]);
      // Ascending by effectiveFrom, as the query orders them. Jane has two rows
      // in force and must take the later one; Lars has none at all.
      userRate.findMany.mockResolvedValue([
        { userId: 7, hourlyRate: 2000 },
        { userId: 8, hourlyRate: 2600 },
        { userId: 7, hourlyRate: 2450 },
      ]);

      await expect(
        service.findAllEmployeeRatesAt(CYCLE_START),
      ).resolves.toEqual([
        { id: 7, name: 'Jane', isActive: true, hourlyRate: 2450 },
        { id: 8, name: 'Karl', isActive: false, hourlyRate: 2600 },
        { id: 9, name: 'Lars', isActive: true, hourlyRate: null },
      ]);
      expect(user.findMany).toHaveBeenCalledTimes(1);
      expect(userRate.findMany).toHaveBeenCalledTimes(1);
      expect(userRate.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: [7, 8, 9] },
          effectiveFrom: { lte: CYCLE_START },
        },
        select: { userId: true, hourlyRate: true },
        orderBy: { effectiveFrom: 'asc' },
      });
    });

    it('findAllEmployeeRatesAt skips the rate query entirely when there is no team', async () => {
      const { service, user, userRate } = makeService();
      user.findMany.mockResolvedValue([]);

      await expect(
        service.findAllEmployeeRatesAt(CYCLE_START),
      ).resolves.toEqual([]);
      expect(userRate.findMany).not.toHaveBeenCalled();
    });
  });

  it('findMe resolves any role, and 404s an id that no longer exists', async () => {
    const { service, user } = makeService();
    user.findUnique.mockResolvedValue(makeUser({ role: Role.ADMIN }));

    // Both roles use /users/me, so this lookup must not filter on role.
    await expect(service.findMe(1)).resolves.toMatchObject({
      role: Role.ADMIN,
    });

    user.findUnique.mockResolvedValue(null);
    await expect(service.findMe(99)).rejects.toThrow(
      'User with id 99 not found.',
    );
  });
});
