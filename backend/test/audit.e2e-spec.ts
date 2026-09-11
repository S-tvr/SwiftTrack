import request from 'supertest';

import { AuditAction } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, type E2EContext } from './helpers/app';
import { resetDatabase } from './helpers/db';
import {
  addShift,
  createActivatedEmployee,
  createPendingEmployee,
  loginAsAdmin,
  seedShift,
  uniqueEmail,
} from './helpers/fixtures';

/**
 * Step 18 — the audit log, against a real database.
 *
 * What only this file can prove, and the unit specs cannot:
 *
 * - the **actor** really arrives from the JWT through the controller and into
 *   the row (the unit specs pass an `actorId` in by hand, so they would keep
 *   passing if the controller stopped supplying one);
 * - the audit row and the mutation really share a transaction — provable only
 *   where a rollback can actually happen;
 * - the table really is append-only, which is a property of the migration and
 *   of Postgres, not of TypeScript.
 *
 * ⚠️ Rows are read through Prisma rather than an endpoint, because step 18
 * deliberately ships no read endpoint. That is the point of the step's scope,
 * not a shortcut taken here.
 */

type AuditRow = {
  id: number;
  action: string;
  actorId: number | null;
  subjectId: number | null;
  entityType: string;
  entityId: number | null;
  before: unknown;
  after: unknown;
};

async function auditRows(
  prisma: PrismaService,
  where: Record<string, unknown> = {},
): Promise<AuditRow[]> {
  return prisma.auditLog.findMany({
    where,
    orderBy: { id: 'asc' },
  });
}

describe('Audit log (e2e)', () => {
  let ctx: E2EContext;
  let adminToken: string;
  let adminId: number;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    adminToken = await loginAsAdmin(ctx.server);
    const admin = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: process.env.ADMIN_EMAIL as string },
      select: { id: true },
    });
    adminId = admin.id;
  });

  describe('the hours — spec §13 gap 2', () => {
    /**
     * ⭐ The gap in its original wording: "nothing records that an entry was
     * edited". The admin edits somebody else's shift, so actor and subject
     * differ — the case a single "userId" column could never express.
     */
    it('records an admin editing an employee’s shift, with the old times', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('edited'),
      });
      const shift = await seedShift(ctx.server, adminToken, employee.id, {
        startTime: '2026-07-01T08:00:00.000Z',
        endTime: '2026-07-01T16:00:00.000Z',
      });

      await request(ctx.server)
        .put(`/time-entries/${shift.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: '2026-07-01T08:00:00.000Z',
          endTime: '2026-07-01T20:00:00.000Z',
        })
        .expect(200);

      const [row] = await auditRows(ctx.prisma, {
        action: AuditAction.SHIFT_UPDATED,
      });

      expect(row.actorId).toBe(adminId);
      expect(row.subjectId).toBe(employee.id);
      expect(row.entityId).toBe(shift.id);
      // ⭐ Four hours were added to somebody's pay. The `before` is what makes
      // that answerable afterwards.
      expect(row.before).toMatchObject({
        endTime: '2026-07-01T16:00:00.000Z',
      });
      expect(row.after).toMatchObject({ endTime: '2026-07-01T20:00:00.000Z' });
    });

    /**
     * ⭐ The sharpest case in the whole step: `DELETE /time-entries/:id` is the
     * only hard delete in the backend, so after it the audit row is the *only*
     * surviving record that those hours ever existed.
     */
    it('preserves a deleted shift’s hours — the row is gone, the record is not', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('deleted'),
      });
      const shift = await seedShift(ctx.server, adminToken, employee.id, {
        startTime: '2026-07-02T09:00:00.000Z',
        endTime: '2026-07-02T17:30:00.000Z',
        notes: 'Stock take',
      });

      await request(ctx.server)
        .delete(`/time-entries/${shift.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await expect(
        ctx.prisma.timeEntry.findUnique({ where: { id: shift.id } }),
      ).resolves.toBeNull();

      const [row] = await auditRows(ctx.prisma, {
        action: AuditAction.SHIFT_DELETED,
      });
      expect(row.actorId).toBe(adminId);
      expect(row.subjectId).toBe(employee.id);
      expect(row.before).toEqual({
        startTime: '2026-07-02T09:00:00.000Z',
        endTime: '2026-07-02T17:30:00.000Z',
        notes: 'Stock take',
      });
      expect(row.after).toBeNull();
    });

    it('records an employee writing their own shift, as themselves', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('self'),
      });
      const now = new Date();
      const start = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const end = new Date(now.getTime() - 60 * 60 * 1000);

      await addShift(ctx.server, employee.token, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      const [row] = await auditRows(ctx.prisma, {
        action: AuditAction.SHIFT_CREATED,
      });
      // Actor and subject coincide here, and that is the ordinary case — but
      // they are still both recorded, so the admin-written row above and this
      // one are read the same way.
      expect(row.actorId).toBe(employee.id);
      expect(row.subjectId).toBe(employee.id);
    });

    /**
     * Clock-in and clock-out are deliberately not audited: the `TimeEntry` row
     * *is* the record, written by the server's own clock from the caller's own
     * session. Pinned so that "why is there no row here?" has an answer.
     */
    it('writes nothing for clock-in and clock-out', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('clock'),
      });

      await request(ctx.server)
        .post('/time-entries/clock-in')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(201);
      await request(ctx.server)
        .patch('/time-entries/clock-out')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(200);

      expect(
        await auditRows(ctx.prisma, {
          action: {
            in: [AuditAction.SHIFT_CREATED, AuditAction.SHIFT_UPDATED],
          },
        }),
      ).toHaveLength(0);
    });
  });

  describe('the administrative acts — step 8g’s gap', () => {
    /**
     * ⭐ The row step 8g said it could not write: "nothing records which admin
     * reset which employee's password, or when."
     */
    it('names the admin who reset an employee’s password', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('reset'),
      });

      await request(ctx.server)
        .post(`/users/${employee.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const [row] = await auditRows(ctx.prisma, {
        action: AuditAction.PASSWORD_RESET_BY_ADMIN,
      });
      expect(row.actorId).toBe(adminId);
      expect(row.subjectId).toBe(employee.id);
      expect(row.entityId).toBe(employee.id);
    });

    it('records a deactivation with the state it changed', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('deactivated'),
      });

      await request(ctx.server)
        .delete(`/users/${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const [row] = await auditRows(ctx.prisma, {
        action: AuditAction.EMPLOYEE_DEACTIVATED,
      });
      expect(row.actorId).toBe(adminId);
      expect(row.before).toMatchObject({ isActive: true });
      expect(row.after).toMatchObject({ isActive: false });
    });

    /**
     * ⭐ The no-op guard. `reactivate` answers 200 on an already-active row and
     * still issues an UPDATE — recording that would put an event in the table
     * that never happened.
     */
    it('writes no row when reactivating an employee who was already active', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('already-active'),
      });

      await request(ctx.server)
        .patch(`/users/${employee.id}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(
        await auditRows(ctx.prisma, {
          action: AuditAction.EMPLOYEE_REACTIVATED,
        }),
      ).toHaveLength(0);
    });

    it('records a genuine reactivation', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('reactivated'),
      });
      await request(ctx.server)
        .delete(`/users/${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(ctx.server)
        .patch(`/users/${employee.id}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const [row] = await auditRows(ctx.prisma, {
        action: AuditAction.EMPLOYEE_REACTIVATED,
      });
      expect(row.before).toMatchObject({ isActive: false });
      expect(row.after).toMatchObject({ isActive: true });
    });

    /**
     * ⭐ Two rows from one request, and the reason they must be two: a reader
     * cannot otherwise tell a rename from a raise.
     */
    it('records a rename and a raise as two separate rows', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('renamed-and-raised'),
        hourlyRate: 2450,
      });

      await request(ctx.server)
        .put(`/users/${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Jane Renamed', hourlyRate: 2800 })
        .expect(200);

      const rows = await auditRows(ctx.prisma, {
        subjectId: employee.id,
        action: {
          in: [AuditAction.EMPLOYEE_UPDATED, AuditAction.RATE_QUEUED],
        },
      });

      expect(rows.map((row) => row.action)).toEqual([
        AuditAction.EMPLOYEE_UPDATED,
        AuditAction.RATE_QUEUED,
      ]);
      expect(rows[0].after).toMatchObject({ name: 'Jane Renamed' });
      expect(rows[1].after).toMatchObject({ hourlyRate: 2800 });
    });

    /**
     * ⭐ The bug this step's review found, against the running backend. An
     * identical re-save produced an `EMPLOYEE_UPDATED` row whose `before` and
     * `after` were byte-for-byte the same.
     *
     * ⚠️ This is the ordinary path, not a contrived one: `EmployeeForm` submits
     * both fields on every save, so an admin who opens a row and presses Save
     * without editing reaches it. Asserted end to end rather than only in the
     * unit spec because what made the bug visible was the **table**, not the
     * call — and because the guard has to survive the controller, the DTO and
     * the `ValidationPipe` in between.
     */
    it('writes no row for a re-save that changed nothing', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('unchanged'),
        name: 'Unchanged Person',
        hourlyRate: 2450,
      });

      await request(ctx.server)
        .put(`/users/${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Unchanged Person', hourlyRate: 2450 })
        .expect(200);

      expect(
        await auditRows(ctx.prisma, {
          subjectId: employee.id,
          action: {
            in: [AuditAction.EMPLOYEE_UPDATED, AuditAction.RATE_QUEUED],
          },
        }),
      ).toHaveLength(0);
    });

    /**
     * The mirror: a raise whose name came back unchanged is **one** event. The
     * rate branch always guarded this — pinned so the two branches cannot drift
     * apart again, which is exactly how the bug above arose.
     */
    it('writes only the rate row when a raise carries an unchanged name', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('rate-only'),
        name: 'Same Name',
        hourlyRate: 2450,
      });

      await request(ctx.server)
        .put(`/users/${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Same Name', hourlyRate: 2800 })
        .expect(200);

      const rows = await auditRows(ctx.prisma, {
        subjectId: employee.id,
        action: {
          in: [AuditAction.EMPLOYEE_UPDATED, AuditAction.RATE_QUEUED],
        },
      });
      expect(rows.map((row) => row.action)).toEqual([AuditAction.RATE_QUEUED]);
    });

    /**
     * ⭐ The row nothing else in the system preserves. `UserRate` upserts on
     * `(userId, effectiveFrom)`, so a second raise inside one cycle overwrites
     * the first — after this, the audit table is the only place the superseded
     * figure still exists.
     */
    it('preserves a queued rate that a second raise overwrote', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('twice-raised'),
        hourlyRate: 2450,
      });

      await request(ctx.server)
        .put(`/users/${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hourlyRate: 2800 })
        .expect(200);
      await request(ctx.server)
        .put(`/users/${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hourlyRate: 3000 })
        .expect(200);

      const rows = await auditRows(ctx.prisma, {
        action: AuditAction.RATE_QUEUED,
        subjectId: employee.id,
      });

      expect(rows).toHaveLength(2);
      // The first raise had nothing to supersede.
      expect(rows[0].before).toBeNull();
      expect(rows[0].after).toMatchObject({ hourlyRate: 2800 });
      // ⭐ 2800 exists nowhere else now — the UserRate row holds 3000.
      expect(rows[1].before).toMatchObject({ hourlyRate: 2800 });
      expect(rows[1].after).toMatchObject({ hourlyRate: 3000 });
    });

    it('records the cycle boundary moving, old days and new', async () => {
      await request(ctx.server)
        .put('/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cycleStartDay: 15, cycleEndDay: 14 })
        .expect(200);

      const [row] = await auditRows(ctx.prisma, {
        action: AuditAction.SETTINGS_UPDATED,
      });
      expect(row.actorId).toBe(adminId);
      // Global configuration — nobody is its subject.
      expect(row.subjectId).toBeNull();
      expect(row.entityId).toBeNull();
      expect(row.before).toEqual({ cycleStartDay: 25, cycleEndDay: 24 });
      expect(row.after).toEqual({ cycleStartDay: 15, cycleEndDay: 14 });
    });

    /**
     * The one null actor in the system: `POST /auth/set-initial-password` is
     * unauthenticated, so there is no session and no actor distinct from the
     * subject.
     */
    it('records a self-activation with a null actor', async () => {
      const created = await createPendingEmployee(ctx.server, adminToken, {
        email: uniqueEmail('activating'),
      });

      await request(ctx.server)
        .post('/auth/set-initial-password')
        .send({
          email: created.email,
          setupCode: created.setupCode,
          newPassword: 'a-brand-new-password',
        })
        .expect(200);

      const [row] = await auditRows(ctx.prisma, {
        action: AuditAction.ACCOUNT_ACTIVATED,
      });
      expect(row.actorId).toBeNull();
      expect(row.subjectId).toBe(created.id);
    });
  });

  describe('what a row never contains', () => {
    /**
     * ⭐ The security claim, end to end and with real secrets — the method step
     * 17 used for the request log, applied to the table.
     *
     * ⚠️ The whole table is serialised and searched, rather than named fields
     * being checked: a field-by-field assertion only covers the fields somebody
     * thought of, and the failure being guarded against is precisely the one
     * nobody thought of.
     */
    it('never stores a password, a setup code or a token version', async () => {
      const created = await createPendingEmployee(ctx.server, adminToken, {
        email: uniqueEmail('canary'),
      });
      const setupCode = created.setupCode as string;
      const password = 'LEAKCANARY-PW-18-AUDIT';

      await request(ctx.server)
        .post('/auth/set-initial-password')
        .send({ email: created.email, setupCode, newPassword: password })
        .expect(200);

      const loginResponse = await request(ctx.server)
        .post('/auth/login')
        .send({ email: created.email, password })
        .expect(200);
      const employeeToken = (loginResponse.body as { accessToken: string })
        .accessToken;

      await request(ctx.server)
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          currentPassword: password,
          newPassword: 'LEAKCANARY-PW-18-SECOND',
        })
        .expect(200);

      await request(ctx.server)
        .post(`/users/${created.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const serialised = JSON.stringify(await auditRows(ctx.prisma));

      expect(serialised).not.toContain(password);
      expect(serialised).not.toContain('LEAKCANARY-PW-18-SECOND');
      expect(serialised).not.toContain(setupCode);
      // The bcrypt hash of any of the above.
      expect(serialised).not.toContain('$2b$');
      expect(serialised).not.toContain('tokenVersion');
      expect(serialised).not.toContain('setupCode');
      // The bearer token itself never touches a service, but assert it anyway —
      // it is the other secret every authenticated request carries.
      expect(serialised).not.toContain(employeeToken);
    });
  });

  describe('the guarantees', () => {
    /**
     * ⭐ Append-only, proved against Postgres rather than asserted in prose.
     * The app's own role owns the table and is a superuser, so `REVOKE` would
     * not have held — the trigger is what does (see the migration).
     */
    it('refuses an UPDATE or a DELETE of a row', async () => {
      await request(ctx.server)
        .put('/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cycleStartDay: 15, cycleEndDay: 14 })
        .expect(200);

      const [row] = await auditRows(ctx.prisma);

      await expect(
        ctx.prisma.auditLog.update({
          where: { id: row.id },
          data: { actorId: 999 },
        }),
      ).rejects.toThrow(/append-only/);

      await expect(
        ctx.prisma.auditLog.delete({ where: { id: row.id } }),
      ).rejects.toThrow(/append-only/);

      // Still exactly as it was written.
      const [after] = await auditRows(ctx.prisma);
      expect(after.actorId).toBe(adminId);
    });

    /**
     * ⭐ The claim the whole "same transaction" decision rests on: if the audit
     * row cannot be written, the change does not happen either.
     *
     * Forced by dropping the trigger's forbearance — a `BEFORE INSERT` trigger
     * that always raises makes the audit insert fail the way a real outage
     * would, without touching application code.
     */
    it('rolls the mutation back when the audit row cannot be written', async () => {
      const employee = await createActivatedEmployee(ctx.server, adminToken, {
        email: uniqueEmail('rollback'),
      });
      const shift = await seedShift(ctx.server, adminToken, employee.id, {
        startTime: '2026-07-03T08:00:00.000Z',
        endTime: '2026-07-03T16:00:00.000Z',
      });

      await ctx.prisma
        .$executeRaw`CREATE OR REPLACE FUNCTION "AuditLog_refuse_insert"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit sink unavailable'; END; $$`;
      await ctx.prisma
        .$executeRaw`CREATE TRIGGER "AuditLog_refuse_insert" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "AuditLog_refuse_insert"()`;

      try {
        await request(ctx.server)
          .delete(`/time-entries/${shift.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(500);

        // ⭐ The shift is still there. A change with no trace is exactly the
        // state this table exists to make unreachable, so the request failing
        // loudly is the designed outcome rather than a regression.
        await expect(
          ctx.prisma.timeEntry.findUnique({ where: { id: shift.id } }),
        ).resolves.not.toBeNull();
      } finally {
        await ctx.prisma
          .$executeRaw`DROP TRIGGER "AuditLog_refuse_insert" ON "AuditLog"`;
        await ctx.prisma.$executeRaw`DROP FUNCTION "AuditLog_refuse_insert"()`;
      }
    });
  });
});
