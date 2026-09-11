import { AuditService } from './audit.service';
import {
  toEmployeeSnapshot,
  toRateSnapshot,
  toSettingsSnapshot,
  toShiftSnapshot,
} from './audit-entry.types';
import { AuditAction, type Prisma } from '../generated/prisma/client';

/**
 * What this file is for: the audit table is the one place in the backend whose
 * *content* is a security property rather than a behaviour. Step 17's logging
 * earned the same treatment for the same reason — `architecture.md` states that
 * nothing a request carries is ever written down, and a claim like that is worth
 * what its test is worth.
 *
 * The transaction is stubbed. That the row lands in the caller's transaction is
 * a property of the signature (there is no other client to write with) and is
 * proved end-to-end in `test/audit.e2e-spec.ts`, where a real rollback can
 * happen.
 */
/** What `auditLog.create` is called with — typed so assertions on the recorded
 *  row are checked rather than reaching through `any`. */
type CreateCall = [
  {
    data: { action: string; actorId: number | null; subjectId: number | null };
  },
];

function makeTx() {
  const create = jest.fn<Promise<void>, CreateCall>().mockResolvedValue();
  return {
    tx: { auditLog: { create } } as unknown as Prisma.TransactionClient,
    create,
  };
}

/** The whole row, as Prisma would hand it over — secrets included. */
const FULL_USER_ROW = {
  id: 7,
  name: 'Jane Employee',
  email: 'jane@example.com',
  password: '$2b$10$ZZZZZZZZZZZZZZZZZZZZZZ',
  role: 'EMPLOYEE' as const,
  hourlyRate: 2450,
  isActive: true,
  setupCode: '4321',
  setupCodeExpiresAt: new Date('2026-01-04T00:00:00.000Z'),
  tokenVersion: 3,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('AuditService', () => {
  describe('the allowlist', () => {
    /**
     * ⭐ The test the whole design exists for. `toEmployeeSnapshot` is handed a
     * complete `User` row — the shape every caller actually has in hand — and
     * must carry across exactly three fields.
     *
     * ⚠️ Asserted with `toEqual` rather than field-by-field `toHaveProperty`
     * checks: an exact-match assertion fails when a field is *added*, which is
     * the failure mode that matters. Listing the three forbidden keys instead
     * would pass happily for the fourth secret somebody introduces later.
     */
    it('copies only name/hourlyRate/isActive off a full User row', () => {
      expect(toEmployeeSnapshot(FULL_USER_ROW)).toEqual({
        name: 'Jane Employee',
        hourlyRate: 2450,
        isActive: true,
      });
    });

    /**
     * The same claim stated the other way round, because this is the one that
     * would be read aloud in a review: no secret, by name.
     */
    it('never carries a password, a setup code or a token version', () => {
      const snapshot = JSON.stringify(toEmployeeSnapshot(FULL_USER_ROW));

      expect(snapshot).not.toContain('$2b$10$');
      expect(snapshot).not.toContain('4321');
      expect(snapshot).not.toContain('password');
      expect(snapshot).not.toContain('setupCode');
      expect(snapshot).not.toContain('tokenVersion');
      // The email is not a secret, but it is not a field any endpoint changes
      // either — so it has no business in a record of what changed.
      expect(snapshot).not.toContain('jane@example.com');
    });

    it('carries the three shift fields, and dates as ISO strings', () => {
      expect(
        toShiftSnapshot({
          startTime: new Date('2026-07-01T08:00:00.000Z'),
          endTime: new Date('2026-07-01T16:00:00.000Z'),
          notes: 'Covered the late delivery',
        }),
      ).toEqual({
        startTime: '2026-07-01T08:00:00.000Z',
        endTime: '2026-07-01T16:00:00.000Z',
        notes: 'Covered the late delivery',
      });
    });

    /**
     * An open shift is a legitimate state, and `null` must survive as `null`
     * rather than becoming the epoch or the string "null" — a deleted open
     * shift's audit row is the only record that it was open.
     */
    it('keeps an open shift’s null endTime', () => {
      expect(
        toShiftSnapshot({
          startTime: new Date('2026-07-01T08:00:00.000Z'),
          endTime: null,
          notes: null,
        }),
      ).toEqual({
        startTime: '2026-07-01T08:00:00.000Z',
        endTime: null,
        notes: null,
      });
    });

    it('carries a rate with the instant it starts applying', () => {
      expect(
        toRateSnapshot({
          hourlyRate: 2800,
          effectiveFrom: new Date('2026-08-25T00:00:00.000Z'),
        }),
      ).toEqual({
        hourlyRate: 2800,
        effectiveFrom: '2026-08-25T00:00:00.000Z',
      });
    });

    it('carries both cycle days', () => {
      expect(
        toSettingsSnapshot({ cycleStartDay: 25, cycleEndDay: 24 }),
      ).toEqual({ cycleStartDay: 25, cycleEndDay: 24 });
    });
  });

  describe('record', () => {
    it('writes exactly the fields of the entry it was given', async () => {
      const { tx, create } = makeTx();
      const service = new AuditService();

      await service.record(tx, {
        action: AuditAction.SHIFT_DELETED,
        actorId: 1,
        subjectId: 7,
        entityType: 'TimeEntry',
        entityId: 42,
        before: {
          startTime: '2026-07-01T08:00:00.000Z',
          endTime: '2026-07-01T16:00:00.000Z',
          notes: null,
        },
        after: null,
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          action: AuditAction.SHIFT_DELETED,
          actorId: 1,
          subjectId: 7,
          entityType: 'TimeEntry',
          entityId: 42,
          before: {
            startTime: '2026-07-01T08:00:00.000Z',
            endTime: '2026-07-01T16:00:00.000Z',
            notes: null,
          },
          // ⚠️ `undefined`, never `null`: Prisma reads an explicit `null` on a
          // Json column as the JSON value `null` rather than SQL NULL, which
          // would make "no after state" indistinguishable from "an after state
          // that is literally null".
          after: undefined,
        },
      });
    });

    /**
     * ⭐ The actor and the subject are different columns and must not be
     * transposed. Nothing about a row's *shape* would reveal the swap — both are
     * `Int?` — so the only place it can be caught is here and in the e2e suite.
     */
    it('keeps the actor and the subject distinct', async () => {
      const { tx, create } = makeTx();

      await new AuditService().record(tx, {
        action: AuditAction.PASSWORD_RESET_BY_ADMIN,
        actorId: 1,
        subjectId: 7,
        entityType: 'User',
        entityId: 7,
        before: { name: 'Jane', hourlyRate: 2450, isActive: true },
        after: { name: 'Jane', hourlyRate: 2450, isActive: true },
      });

      const { data } = create.mock.calls[0][0];
      expect(data.actorId).toBe(1);
      expect(data.subjectId).toBe(7);
    });

    /** The unauthenticated activation path — a null actor is an answer. */
    it('accepts a null actor for a self-activation', async () => {
      const { tx, create } = makeTx();

      await new AuditService().record(tx, {
        action: AuditAction.ACCOUNT_ACTIVATED,
        actorId: null,
        subjectId: 7,
        entityType: 'User',
        entityId: 7,
        before: { name: 'Jane', hourlyRate: 2450, isActive: true },
        after: { name: 'Jane', hourlyRate: 2450, isActive: true },
      });

      const { data } = create.mock.calls[0][0];
      expect(data.actorId).toBeNull();
      expect(data.subjectId).toBe(7);
    });
  });

  describe('recordAll', () => {
    /**
     * ⚠️ Order is the assertion, not the count. `PUT /users/:id` can rename an
     * employee *and* queue a raise, and the two rows are read as a sequence.
     */
    it('writes every entry, in the order given', async () => {
      const { tx, create } = makeTx();

      await new AuditService().recordAll(tx, [
        {
          action: AuditAction.EMPLOYEE_UPDATED,
          actorId: 1,
          subjectId: 7,
          entityType: 'User',
          entityId: 7,
          before: { name: 'Jane', hourlyRate: 2450, isActive: true },
          after: { name: 'Jane Renamed', hourlyRate: 2800, isActive: true },
        },
        {
          action: AuditAction.RATE_QUEUED,
          actorId: 1,
          subjectId: 7,
          entityType: 'UserRate',
          entityId: null,
          before: null,
          after: {
            hourlyRate: 2800,
            effectiveFrom: '2026-08-25T00:00:00.000Z',
          },
        },
      ]);

      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls.map((call) => call[0].data.action)).toEqual([
        AuditAction.EMPLOYEE_UPDATED,
        AuditAction.RATE_QUEUED,
      ]);
    });

    it('writes nothing when given nothing', async () => {
      const { tx, create } = makeTx();
      await new AuditService().recordAll(tx, []);
      expect(create).not.toHaveBeenCalled();
    });
  });
});
