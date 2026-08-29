import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import type { PrismaService } from '../prisma/prisma.service';
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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeService() {
  const user = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makeUser()),
    update: jest.fn().mockResolvedValue(makeUser()),
  };
  const prisma = { user } as unknown as PrismaService;
  return { service: new UsersService(prisma), user };
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
    it('findActiveById selects only id and role, and requires isActive', async () => {
      const { service, user } = makeService();

      await service.findActiveById(7);

      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 7, isActive: true },
        select: { id: true, role: true },
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
     * The shift list's counterpart to `findEmployeeRate`. It answers "whose
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

    it('findEmployeeRate returns null for a non-EMPLOYEE and never loads secrets', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(null);

      await expect(service.findEmployeeRate(1)).resolves.toBeNull();
      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 1, role: Role.EMPLOYEE },
        select: { id: true, name: true, hourlyRate: true },
      });
    });

    /**
     * Deliberately a batch reader: fifteen employees through
     * `findEmployeeRate()` in a loop would be fifteen round trips on a page
     * that should cost one. `isActive` comes back so the caller can apply its
     * own rule about who belongs on the overview for a given cycle.
     */
    it('findAllEmployeeRates fetches the team in one query, active flag included', async () => {
      const { service, user } = makeService();

      await service.findAllEmployeeRates();

      expect(user.findMany).toHaveBeenCalledTimes(1);
      expect(user.findMany).toHaveBeenCalledWith({
        where: { role: Role.EMPLOYEE },
        select: { id: true, name: true, hourlyRate: true, isActive: true },
        orderBy: { name: 'asc' },
      });
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
