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
     * checks `isActive`, there is no reactivation endpoint, and there is no
     * public register route.
     */
    it('404s instead of writing, and never issues the update', async () => {
      for (const call of [
        (s: UsersService) => s.updateEmployee(1, { name: 'Renamed' }),
        (s: UsersService) => s.deactivate(1),
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
