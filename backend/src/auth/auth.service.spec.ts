import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import type { UsersService } from '../users/users.service';
import type { JwtService } from '@nestjs/jwt';
import { Role, type User } from '../generated/prisma/client';

/**
 * `AuthService` is the one place in this backend where a wrong **order** of
 * checks is a security bug rather than a display bug, and it has already been
 * wrong once: `setInitialPassword` was missing its `isActive` check, which
 * `/review` caught in step 3 — no test did, because there were none.
 *
 * Messages are asserted **verbatim**, as everywhere else in the suite. §8a
 * stopped being a binding contract on the *documentation* side (the table
 * records the wording rather than dictating it), but the tests remain the
 * regression net: changing one of these sentences should be a deliberate edit
 * that shows up here, not something that slips through unnoticed.
 *
 * Prisma never appears in this file. `AuthService` reaches `User` only through
 * `UsersService` (an invariant), so stubbing that is stubbing the whole world.
 */

/**
 * Only `compare` is replaced· `hash` stays real so the success path below is
 * checked against an actual bcrypt digest. A `jest.spyOn` cannot be used here:
 * bcrypt v6's exports are non-configurable, so redefining one throws.
 */
jest.mock('bcrypt', () => ({
  ...jest.requireActual<typeof import('bcrypt')>('bcrypt'),
  compare: jest.fn(),
}));

const compare = bcrypt.compare as unknown as jest.Mock;

const INVALID_CREDENTIALS = 'Invalid email or password.';
const DEACTIVATED = 'This account is no longer active.';
const NOT_ACTIVATED =
  "This account hasn't been activated yet. Please activate it first.";
const USER_NOT_FOUND = 'User not found.';
const ALREADY_ACTIVATED = 'This account has already been activated.';
const INVALID_CODE = 'Invalid activation code.';
const EXPIRED_CODE =
  'This activation code has expired. Please contact your admin.';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 7,
    name: 'Jane Employee',
    email: 'jane@example.com',
    password: 'hashed',
    role: Role.EMPLOYEE,
    hourlyRate: 2450,
    isActive: true,
    setupCode: null,
    setupCodeExpiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeService(user: User | null) {
  const findByEmail = jest.fn().mockResolvedValue(user);
  const activateAccount = jest.fn().mockResolvedValue(user);
  const toProfileDto = jest.fn().mockReturnValue({ id: 7, name: 'Jane' });
  const signAsync = jest.fn().mockResolvedValue('signed.jwt.token');

  const usersService = {
    findByEmail,
    activateAccount,
    toProfileDto,
  } as unknown as UsersService;
  const jwtService = { signAsync } as unknown as JwtService;

  return {
    service: new AuthService(usersService, jwtService),
    findByEmail,
    activateAccount,
    toProfileDto,
    signAsync,
  };
}

describe('AuthService', () => {
  beforeEach(() => compare.mockReset());

  describe('login — the order of checks', () => {
    it('issues a token and the caller’s own profile on success', async () => {
      compare.mockResolvedValue(true);
      const { service, toProfileDto, signAsync } = makeService(makeUser());

      const result = await service.login('jane@example.com', 'correct');

      expect(result.accessToken).toBe('signed.jwt.token');
      // Exactly the two claims, and role comes off the row rather than input.
      expect(signAsync).toHaveBeenCalledWith({
        userId: 7,
        role: Role.EMPLOYEE,
      });
      // Never UserResponseDto: that one carries setupCode, the secret that
      // unlocks an unactivated account (architecture.md § Invariants).
      expect(toProfileDto).toHaveBeenCalled();
    });

    it('answers an unknown email with the generic credentials message', async () => {
      const { service } = makeService(null);

      await expect(service.login('nobody@example.com', 'x')).rejects.toThrow(
        INVALID_CREDENTIALS,
      );
    });

    it('answers a wrong password with the same message, never a distinct one', async () => {
      compare.mockResolvedValue(false);
      const { service } = makeService(makeUser());

      // Identical to the unknown-email answer on purpose: at this endpoint the
      // caller has proved nothing, so it learns nothing about which half failed.
      await expect(service.login('jane@example.com', 'wrong')).rejects.toThrow(
        INVALID_CREDENTIALS,
      );
    });

    /**
     * ⭐ The ordering that matters. A user who is both deactivated **and** never
     * activated must be told they are deactivated: sending them down the
     * activation path would be sending them somewhere that can never work,
     * because login re-checks `isActive` at the end of it.
     */
    it('reports deactivation ahead of non-activation when both are true', async () => {
      const { service } = makeService(
        makeUser({ isActive: false, password: null }),
      );

      await expect(
        service.login('jane@example.com', 'anything'),
      ).rejects.toThrow(DEACTIVATED);
      await expect(
        service.login('jane@example.com', 'anything'),
      ).rejects.not.toThrow(NOT_ACTIVATED);
    });

    it('tells a never-activated account to activate, not that its password is wrong', async () => {
      const { service } = makeService(makeUser({ password: null }));

      await expect(
        service.login('jane@example.com', 'anything'),
      ).rejects.toThrow(NOT_ACTIVATED);
    });

    it('raises 401 for every failure path', async () => {
      compare.mockResolvedValue(false);

      for (const user of [
        null,
        makeUser({ isActive: false }),
        makeUser({ password: null }),
        makeUser(),
      ]) {
        await expect(
          makeService(user).service.login('jane@example.com', 'x'),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
    });

    it('never reaches bcrypt for a deactivated or unactivated account', async () => {
      await makeService(makeUser({ isActive: false }))
        .service.login('jane@example.com', 'x')
        .catch(() => undefined);
      await makeService(makeUser({ password: null }))
        .service.login('jane@example.com', 'x')
        .catch(() => undefined);

      // Proves the checks short-circuit rather than merely being present: a
      // null password reaching bcrypt.compare would throw a different error.
      expect(compare).not.toHaveBeenCalled();
    });
  });

  describe('setInitialPassword — the order of checks', () => {
    const pending = (overrides: Partial<User> = {}) =>
      makeUser({
        password: null,
        setupCode: '1234',
        setupCodeExpiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      });

    it('hashes and stores the password on success', async () => {
      const { service, activateAccount } = makeService(pending());

      await service.setInitialPassword(
        'jane@example.com',
        '1234',
        'a-good-password',
      );

      expect(activateAccount).toHaveBeenCalledTimes(1);
      const [email, hashed] = activateAccount.mock.calls[0] as [string, string];
      expect(email).toBe('jane@example.com');
      // Never the plaintext (architecture.md § Invariants). `hash` is the real
      // implementation here, so this is an actual bcrypt digest.
      expect(hashed).not.toBe('a-good-password');
      expect(hashed).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('404s an unknown email', async () => {
      const { service } = makeService(null);

      await expect(
        service.setInitialPassword('nobody@example.com', '1234', 'password1'),
      ).rejects.toThrow(USER_NOT_FOUND);
      await expect(
        makeService(null).service.setInitialPassword(
          'nobody@example.com',
          '1234',
          'password1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    /**
     * ⭐ The check that was missing until step 3. An unauthenticated endpoint
     * was writing a password onto an account the admin had just deactivated,
     * flipping their Team-page badge from "Pending" back to "Active".
     */
    it('refuses a deactivated account, ahead of every later check', async () => {
      const { service, activateAccount } = makeService(
        pending({ isActive: false }),
      );

      await expect(
        service.setInitialPassword('jane@example.com', '1234', 'password1'),
      ).rejects.toThrow(DEACTIVATED);
      expect(activateAccount).not.toHaveBeenCalled();
    });

    it('reports an already-activated account as a conflict', async () => {
      const { service } = makeService(pending({ password: 'already-hashed' }));

      await expect(
        service.setInitialPassword('jane@example.com', '1234', 'password1'),
      ).rejects.toThrow(ALREADY_ACTIVATED);
      await expect(
        makeService(
          pending({ password: 'already-hashed' }),
        ).service.setInitialPassword('jane@example.com', '1234', 'password1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a wrong code and an expired code with their own messages', async () => {
      // Different situations, different remedies — retype it, versus ask the
      // admin for a new one. Collapsing them would leave the employee guessing.
      await expect(
        makeService(pending()).service.setInitialPassword(
          'jane@example.com',
          '9999',
          'password1',
        ),
      ).rejects.toThrow(INVALID_CODE);

      await expect(
        makeService(
          pending({ setupCodeExpiresAt: new Date(Date.now() - 1) }),
        ).service.setInitialPassword('jane@example.com', '1234', 'password1'),
      ).rejects.toThrow(EXPIRED_CODE);
    });

    it('treats a missing expiry as expired rather than as no deadline', async () => {
      const { service, activateAccount } = makeService(
        pending({ setupCodeExpiresAt: null }),
      );

      await expect(
        service.setInitialPassword('jane@example.com', '1234', 'password1'),
      ).rejects.toThrow(EXPIRED_CODE);
      expect(activateAccount).not.toHaveBeenCalled();
    });

    /**
     * ⭐ A rejected attempt must not burn the code. Otherwise one typo — or one
     * brute-force probe from someone else — would permanently lock an employee
     * out of their own activation, with no reissue endpoint to recover through.
     */
    it.each([
      ['a wrong code', '9999', {}],
      ['a deactivated account', '1234', { isActive: false }],
      ['an already-activated account', '1234', { password: 'hashed' }],
      [
        'an expired code',
        '1234',
        { setupCodeExpiresAt: new Date(Date.now() - 1) },
      ],
    ])('never consumes the setup code after %s', async (_, code, overrides) => {
      const { service, activateAccount } = makeService(pending(overrides));

      await service
        .setInitialPassword('jane@example.com', code, 'password1')
        .catch(() => undefined);

      expect(activateAccount).not.toHaveBeenCalled();
    });
  });
});
