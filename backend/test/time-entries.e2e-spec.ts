import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { resetDatabase } from './helpers/db';
import {
  addShift,
  createActivatedEmployee,
  loginAsAdmin,
  seedShift,
  type ActivatedEmployee,
} from './helpers/fixtures';
import type {
  CycleEntriesBody,
  ErrorBody,
  OpenShiftBody,
  TimeEntryBody,
} from './helpers/types';

/**
 * The date every employee-written fixture below uses, resolved per run rather
 * than written down. Two rules constrain it at once and a literal satisfies
 * neither for long: rule 4 forbids future timestamps, and rule 5 confines an
 * EMPLOYEE to the current or previous cycle — so a fixed calendar date is
 * writable only until it falls out of the window, and then the suite fails on a
 * day nobody changed anything. (That is not hypothetical: a sibling test in
 * payroll.e2e-spec.ts hardcoded "now is in the 2026-07 cycle" and went red on
 * its own, one cycle boundary later.)
 *
 * The day before the current cycle opened is inside the previous cycle by
 * construction — cycles are contiguous — and is therefore both writable and
 * safely in the past. The boundary comes from the API, never computed here.
 */
let MON: string;

const dayBefore = (iso: string): string => {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

describe('/time-entries', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let employee: ActivatedEmployee;

  beforeAll(async () => {
    ({ app, server, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    adminToken = await loginAsAdmin(server);
    employee = await createActivatedEmployee(server, adminToken);

    // `?cycle=` omitted, so the backend answers with the cycle containing now.
    const current = await request(server)
      .get('/time-entries/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200);
    MON = dayBefore((current.body as CycleEntriesBody).cycleStart);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  /**
   * §8b point 1, for the module with the most routes — and the one where this
   * exact class of bug has already happened: `GET /time-entries/me` shipped in
   * step 5 with only `JwtAuthGuard` and no `@Roles`, found by review rather
   * than by any test. A guard that is present in the source but not executing
   * looks identical from the outside until someone sends the wrong token.
   */
  describe('guards are executing on every route', () => {
    type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

    /** Every route the controller exposes. Ids are irrelevant without a token. */
    const allRoutes: Array<[string, Method, string]> = [
      ['POST /clock-in', 'post', '/time-entries/clock-in'],
      ['PATCH /clock-out', 'patch', '/time-entries/clock-out'],
      ['GET /open', 'get', '/time-entries/open'],
      ['GET /me', 'get', '/time-entries/me'],
      ['GET ?userId=', 'get', '/time-entries?userId=1'],
      ['POST /time-entries', 'post', '/time-entries'],
      ['PUT /:id', 'put', '/time-entries/1'],
      ['DELETE /:id', 'delete', '/time-entries/1'],
    ];

    /** The admin never clocks in and has no Clock page (spec §8). */
    const employeeOnly: Array<[string, Method, string]> = allRoutes.slice(0, 4);

    it.each(allRoutes)('%s answers 401 without a token', async (_, m, url) => {
      await request(server)[m](url).expect(401);
    });

    it.each(employeeOnly)('%s answers 403 for an ADMIN', async (_, m, url) => {
      await request(server)
        [m](url)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });

  /**
   * ⭐ The boundary case this whole step was built for (§8b point 2).
   *
   * ⚠️ Measured, not assumed: `time-entries.service.spec.ts` **does** catch a
   * `gte` here — it pins the exact `where` object, so swapping the operator
   * fails it. That was verified by injecting the bug and watching both suites.
   * What the unit test cannot do is anything about *behaviour*: it restates the
   * implementation, so a refactor that moves the condition (or updates the
   * expected object alongside the code) keeps passing while the semantics
   * change, and it can never show that Postgres actually accepts this pair —
   * only that we typed `gt`. This test asserts the outcome instead of the
   * query: two back-to-back shifts exist, therefore no collision was raised.
   */
  it('accepts a shift that starts exactly when the previous one ends', async () => {
    await addShift(server, employee.token, {
      startTime: `${MON}T08:00:00.000Z`,
      endTime: `${MON}T16:00:00.000Z`,
    });

    await addShift(server, employee.token, {
      startTime: `${MON}T16:00:00.000Z`,
      endTime: `${MON}T20:00:00.000Z`,
    });

    expect(
      await prisma.timeEntry.count({ where: { userId: employee.id } }),
    ).toBe(2);
  });

  it('rejects a genuinely overlapping shift with 400', async () => {
    await addShift(server, employee.token, {
      startTime: `${MON}T08:00:00.000Z`,
      endTime: `${MON}T16:00:00.000Z`,
    });

    await request(server)
      .post('/time-entries')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        startTime: `${MON}T12:00:00.000Z`,
        endTime: `${MON}T20:00:00.000Z`,
      })
      .expect(400);
  });

  it('rejects endTime before startTime, and allows equal', async () => {
    await request(server)
      .post('/time-entries')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        startTime: `${MON}T16:00:00.000Z`,
        endTime: `${MON}T08:00:00.000Z`,
      })
      .expect(400);

    // A zero-length entry is harmless (0 hours) and may carry notes.
    await addShift(server, employee.token, {
      startTime: `${MON}T09:00:00.000Z`,
      endTime: `${MON}T09:00:00.000Z`,
      notes: 'zero length',
    });
  });

  it('rejects timestamps in the future with 400', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await request(server)
      .post('/time-entries')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ startTime: tomorrow, endTime: tomorrow })
      .expect(400);
  });

  describe('clock in / clock out', () => {
    it('refuses a second clock-in while one is open', async () => {
      await request(server)
        .post('/time-entries/clock-in')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(201);

      await request(server)
        .post('/time-entries/clock-in')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(400);
    });

    /**
     * §8b point 3 — the **partial unique index** added in step 5, which the
     * service-level check alone cannot provide. Two taps on the biggest button
     * on a phone is the ordinary case, not an attack.
     */
    it('survives 8 concurrent clock-ins with exactly one open shift', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(server)
            .post('/time-entries/clock-in')
            .set('Authorization', `Bearer ${employee.token}`),
        ),
      );

      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 400)).toHaveLength(7);
      expect(statuses.filter((s) => s >= 500)).toHaveLength(0);

      expect(
        await prisma.timeEntry.count({
          where: { userId: employee.id, endTime: null },
        }),
      ).toBe(1);
    });

    it('refuses clock-out when nothing is open', async () => {
      await request(server)
        .patch('/time-entries/clock-out')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(400);
    });

    /**
     * The wrapper is not decoration: Nest answers a bare `null` return with an
     * empty body, and `api/client.ts` (step 9) calls `res.json()` on every
     * response — so the endpoint whose normal answer is "nothing" would be the
     * one that breaks it.
     */
    it('always returns an object from /open, even with no open shift', async () => {
      const empty = await request(server)
        .get('/time-entries/open')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(200);
      expect(empty.body).toEqual({ openShift: null });

      await request(server)
        .post('/time-entries/clock-in')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(201);

      const open = await request(server)
        .get('/time-entries/open')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(200);
      expect((open.body as OpenShiftBody).openShift).not.toBeNull();
    });
  });

  describe('the open-shift block is asymmetric by role', () => {
    it('blocks the EMPLOYEE from writing at all while their shift is open', async () => {
      await request(server)
        .post('/time-entries/clock-in')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(201);

      await request(server)
        .post('/time-entries')
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          startTime: `${MON}T08:00:00.000Z`,
          endTime: `${MON}T16:00:00.000Z`,
        })
        .expect(400);
    });

    /**
     * Without this exception an open shift belonging to a **deactivated**
     * employee — who can no longer log in to clock out — would stay open
     * forever, and the admin would be locked out of the whole ledger for as
     * long as anyone happened to be on shift.
     */
    it('lets the ADMIN close someone else’s open shift with PUT', async () => {
      const clockIn = await request(server)
        .post('/time-entries/clock-in')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(201);
      const entryId = (clockIn.body as { id: number }).id;

      await request(server)
        .put(`/time-entries/${entryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: `${MON}T08:00:00.000Z`,
          endTime: `${MON}T16:00:00.000Z`,
        })
        .expect(200);

      expect(
        await prisma.timeEntry.count({
          where: { userId: employee.id, endTime: null },
        }),
      ).toBe(0);
    });
  });

  describe('owner-or-ADMIN', () => {
    it('resolves another employee’s row to 404, never 403', async () => {
      const other = await createActivatedEmployee(server, adminToken);
      const entry = await addShift(server, other.token, {
        startTime: `${MON}T08:00:00.000Z`,
        endTime: `${MON}T16:00:00.000Z`,
      });

      await request(server)
        .put(`/time-entries/${entry.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          startTime: `${MON}T09:00:00.000Z`,
          endTime: `${MON}T17:00:00.000Z`,
        })
        .expect(404);

      await request(server)
        .delete(`/time-entries/${entry.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(404);
    });

    it('rejects a userId from an EMPLOYEE and requires one from an ADMIN', async () => {
      await request(server)
        .post('/time-entries')
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          userId: employee.id,
          startTime: `${MON}T08:00:00.000Z`,
          endTime: `${MON}T16:00:00.000Z`,
        })
        .expect(400);

      await request(server)
        .post('/time-entries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: `${MON}T08:00:00.000Z`,
          endTime: `${MON}T16:00:00.000Z`,
        })
        .expect(400);

      // With a userId the admin writes to the employee, not to themselves.
      const created = await addShift(server, adminToken, {
        userId: employee.id,
        startTime: `${MON}T08:00:00.000Z`,
        endTime: `${MON}T16:00:00.000Z`,
      });
      expect(created.userId).toBe(employee.id);
    });
  });

  /**
   * Two behaviours that read like bugs and are not. Both were weighed at the
   * end of step 5, kept deliberately, and documented in Swagger in step 7 —
   * which makes them contract. They are pinned here so that "surprising" and
   * "broken" stay distinguishable, and so a future change to either is a
   * decision rather than an accident.
   */
  describe('documented behaviours that look like bugs', () => {
    /**
     * `PUT` is a full replacement, not a patch. The approved `ShiftForm` always
     * sends all three fields, so the UI never hits this — but Swagger and curl
     * do, and step 11 must not "optimise" the form into sending only changed
     * fields, which would silently erase notes.
     */
    it('PUT without notes clears existing notes, rather than keeping them', async () => {
      const entry = await addShift(server, employee.token, {
        startTime: `${MON}T08:00:00.000Z`,
        endTime: `${MON}T16:00:00.000Z`,
        notes: 'Original note',
      });
      expect(entry.notes).toBe('Original note');

      const updated = await request(server)
        .put(`/time-entries/${entry.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          startTime: `${MON}T08:00:00.000Z`,
          endTime: `${MON}T17:00:00.000Z`,
        })
        .expect(200);

      expect((updated.body as TimeEntryBody).notes).toBeNull();
    });

    /**
     * The open-shift block covers `POST` and `PUT`, not `DELETE`. So an
     * employee can delete an open shift instead of clocking out of it. Safe —
     * nothing is mispaid, an unclosed shift is worth 0 either way — but it
     * discards the clock-in record rather than correcting it.
     */
    it('DELETE is not blocked by an open shift, unlike POST and PUT', async () => {
      const clockIn = await request(server)
        .post('/time-entries/clock-in')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(201);
      const openId = (clockIn.body as TimeEntryBody).id;

      // POST is blocked while the shift is open …
      await request(server)
        .post('/time-entries')
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          startTime: `${MON}T08:00:00.000Z`,
          endTime: `${MON}T16:00:00.000Z`,
        })
        .expect(400);

      // … but DELETE on the open row itself goes through.
      await request(server)
        .delete(`/time-entries/${openId}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(204);

      expect(
        await prisma.timeEntry.count({ where: { userId: employee.id } }),
      ).toBe(0);
    });
  });

  describe('the cycle list', () => {
    it('is EMPLOYEE-only on /me and ADMIN-only on the query form', async () => {
      await request(server)
        .get('/time-entries/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      await request(server)
        .get(`/time-entries?userId=${employee.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(403);
    });

    /**
     * A shift crossing the cycle boundary appears in **both** cycles, flagged
     * `isSplit` — which is the only thing explaining why the same row reappears
     * when the ◀▶ navigator moves.
     */
    it('marks a boundary-crossing shift as split in both cycles', async () => {
      // Fri 24 Jul 20:00 → Sat 25 Jul 03:00, with the boundary at the 25th.
      // Seeded as the admin: the fixed date is the point of the test, and only
      // the admin is exempt from the cycle window that date will fall out of.
      await seedShift(server, adminToken, employee.id, {
        startTime: '2026-07-24T20:00:00.000Z',
        endTime: '2026-07-25T03:00:00.000Z',
      });

      for (const cycle of ['2026-06', '2026-07']) {
        const response = await request(server)
          .get(`/time-entries/me?cycle=${cycle}`)
          .set('Authorization', `Bearer ${employee.token}`)
          .expect(200);

        const body = response.body as CycleEntriesBody;
        expect(body.cycle).toBe(cycle);
        expect(body.entries).toHaveLength(1);
        expect(body.entries[0].isSplit).toBe(true);
        // Deliberately absent — hours live only in /payroll (spec §4, 5f).
        expect(body.entries[0]).not.toHaveProperty('hoursInCycle');
      }
    });

    it('lists an open shift under the cycle its startTime falls in', async () => {
      await request(server)
        .post('/time-entries/clock-in')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(201);

      const response = await request(server)
        .get('/time-entries/me')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(200);

      const body = response.body as CycleEntriesBody;
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].endTime).toBeNull();
      // An open shift has no end, so it cannot be split.
      expect(body.entries[0].isSplit).toBe(false);
    });

    /**
     * Step 8d — whose list this is.
     *
     * The admin's `/shifts/:userId` and `/payroll/:userId` are twin pages for
     * the same third person, and the payroll response has carried
     * `userId`/`name` since step 6. Without them here the shift page would need
     * a second call to `GET /users` to print one label — the whole team, every
     * pending `setupCode` included, to render a heading.
     */
    it('names the employee on both routes, and returns the same fields either way', async () => {
      const mine = await request(server)
        .get('/time-entries/me')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(200);
      const mineBody = mine.body as CycleEntriesBody;
      expect(mineBody.userId).toBe(employee.id);
      expect(mineBody.name).toBe(employee.name);

      const asAdmin = await request(server)
        .get(`/time-entries?userId=${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const adminBody = asAdmin.body as CycleEntriesBody;
      expect(adminBody.userId).toBe(employee.id);
      expect(adminBody.name).toBe(employee.name);

      // One shape for both routes (build-plan §5) — which is the reason /me
      // carries a name the employee's own page has no use for.
      expect(Object.keys(adminBody).sort()).toEqual(
        Object.keys(mineBody).sort(),
      );
    });

    it('gives the admin the name of the employee they asked for, not another', async () => {
      // A second employee exists, so picking the wrong row is visible rather
      // than accidentally right.
      const other = await createActivatedEmployee(server, adminToken, {
        name: 'Sigríður Ólafsdóttir',
      });

      const response = await request(server)
        .get(`/time-entries?userId=${other.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as CycleEntriesBody;
      expect(body.userId).toBe(other.id);
      expect(body.name).toBe('Sigríður Ólafsdóttir');
    });

    it('404s an id that is not an EMPLOYEE, the admin’s own included', async () => {
      // Unchanged by step 8d: the reader that resolves the name throws exactly
      // the 404 `assertEmployeeExists` used to, which is what let it replace it.
      const admin = await prisma.user.findFirstOrThrow({
        where: { role: 'ADMIN' },
      });

      const own = await request(server)
        .get(`/time-entries?userId=${admin.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect((own.body as ErrorBody).code).toBe('EMPLOYEE_NOT_FOUND');

      const unknown = await request(server)
        .get('/time-entries?userId=999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect((unknown.body as ErrorBody).code).toBe('EMPLOYEE_NOT_FOUND');
    });

    /**
     * ⭐ No `isActive` filter on the reader, deliberately — the admin must still
     * be able to read and repair the history of someone who has left, including
     * the open shift they can no longer log in to close.
     */
    it('still names and lists a deactivated employee, so their history stays readable', async () => {
      const leaver = await createActivatedEmployee(server, adminToken, {
        name: 'Kristján Departed',
      });
      await seedShift(server, adminToken, leaver.id, {
        startTime: `${MON}T08:00:00.000Z`,
        endTime: `${MON}T16:00:00.000Z`,
      });
      await request(server)
        .delete(`/users/${leaver.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const current = await request(server)
        .get(`/time-entries?userId=${leaver.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const currentBody = current.body as CycleEntriesBody;
      expect(currentBody.name).toBe('Kristján Departed');

      // MON is the day before this cycle opened, so the seeded shift sits in
      // the previous one — whose key is read off the response, never computed.
      const previous = await request(server)
        .get(`/time-entries?userId=${leaver.id}&cycle=${currentBody.prevCycle}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const previousBody = previous.body as CycleEntriesBody;
      expect(previousBody.name).toBe('Kristján Departed');
      expect(previousBody.entries).toHaveLength(1);
    });
  });

  /**
   * Spec §7a rule 5 (step 8c): once a cycle is paid, an EMPLOYEE stops being
   * able to move its record. All three verbs, because editing a July shift down
   * to two hours corrupts a paid cycle exactly as deleting it does — locking one
   * door and leaving two open reads as protection without being any.
   *
   * The locked date is fixed and long past; the writable ones are derived from
   * the API, so neither side of the boundary depends on today's date.
   */
  describe('the cycle lock (§7a rule 5)', () => {
    const LOCKED_DAY = '2024-03-04';
    // The cycle *containing* that day, not its calendar month: with a 25th
    // boundary, 4 March falls in the cycle that opened on 25 February.
    const LOCKED_CYCLE = '2024-02';
    const locked = {
      startTime: `${LOCKED_DAY}T08:00:00.000Z`,
      endTime: `${LOCKED_DAY}T16:00:00.000Z`,
    };
    const writable = () => ({
      startTime: `${MON}T08:00:00.000Z`,
      endTime: `${MON}T16:00:00.000Z`,
    });

    it('refuses an employee creating a shift in a closed cycle', async () => {
      const response = await request(server)
        .post('/time-entries')
        .set('Authorization', `Bearer ${employee.token}`)
        .send(locked)
        .expect(400);

      expect((response.body as ErrorBody).code).toBe('CYCLE_LOCKED');
    });

    it('refuses an employee editing or deleting a row in a closed cycle', async () => {
      // Seeded by the admin, who is exempt — which is also what makes the row
      // exist at all for this test.
      const old = await seedShift(server, adminToken, employee.id, locked);

      const edit = await request(server)
        .put(`/time-entries/${old.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .send({ ...locked, notes: 'trying to change history' })
        .expect(400);
      expect((edit.body as ErrorBody).code).toBe('CYCLE_LOCKED');

      const remove = await request(server)
        .delete(`/time-entries/${old.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(400);
      expect((remove.body as ErrorBody).code).toBe('CYCLE_LOCKED');

      // Still there — a refused write must not half-happen.
      const still = await prisma.timeEntry.findUnique({
        where: { id: old.id },
      });
      expect(still).not.toBeNull();
    });

    it('refuses an employee dragging a locked row into the writable window', async () => {
      // The new value is legal, the existing row is not. Checking only the
      // incoming times would let a paid cycle be emptied one shift at a time.
      const old = await seedShift(server, adminToken, employee.id, locked);

      const response = await request(server)
        .put(`/time-entries/${old.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .send(writable())
        .expect(400);

      expect((response.body as ErrorBody).code).toBe('CYCLE_LOCKED');
    });

    it('refuses an employee pushing a writable row back into a closed cycle', async () => {
      // The mirror image, and the reason both ends are checked.
      const recent = await addShift(server, employee.token, writable());

      const response = await request(server)
        .put(`/time-entries/${recent.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .send(locked)
        .expect(400);

      expect((response.body as ErrorBody).code).toBe('CYCLE_LOCKED');
    });

    it('lets the admin write in a closed cycle — the exemption is load-bearing', async () => {
      // Not a convenience: clock-out is EMPLOYEE-only and closes the caller's
      // own shift, so PUT is the only tool that exists for a deactivated
      // employee's forgotten open shift.
      const old = await seedShift(server, adminToken, employee.id, locked);

      await request(server)
        .put(`/time-entries/${old.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...locked, notes: 'corrected by admin' })
        .expect(200);

      await request(server)
        .delete(`/time-entries/${old.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    /**
     * Both flags exist because the client may not resolve cycle boundaries
     * itself. `canWrite` is the one a POST needs — a creation has no row to
     * carry a per-entry flag, so without it an employee fills in the form on a
     * closed cycle and meets a 400 nothing on screen predicted.
     */
    it('reports canWrite and canEdit so the UI can disable what would fail', async () => {
      const old = await seedShift(server, adminToken, employee.id, locked);
      await addShift(server, employee.token, writable());

      const closed = await request(server)
        .get(`/time-entries/me?cycle=${LOCKED_CYCLE}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(200);
      const closedBody = closed.body as CycleEntriesBody;
      expect(closedBody.canWrite).toBe(false);
      expect(closedBody.entries.some((e) => e.id === old.id)).toBe(true);
      expect(closedBody.entries.every((e) => e.canEdit === false)).toBe(true);

      const open = await request(server)
        .get('/time-entries/me')
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(200);
      const openBody = open.body as CycleEntriesBody;
      expect(openBody.canWrite).toBe(true);

      // A cycle that has not opened yet is unwritable in the other direction —
      // rule 4 refuses every timestamp it could contain. The ▶ can navigate
      // there, so the flag has to say so rather than let the form be filled in.
      const ahead = await request(server)
        .get(`/time-entries/me?cycle=${openBody.nextCycle}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .expect(200);
      expect((ahead.body as CycleEntriesBody).canWrite).toBe(false);

      // The admin sees the same shape with both flags true, on the same closed
      // cycle — one response shape for both routes, as §5 requires.
      const asAdmin = await request(server)
        .get(`/time-entries?userId=${employee.id}&cycle=${LOCKED_CYCLE}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const adminBody = asAdmin.body as CycleEntriesBody;
      expect(adminBody.canWrite).toBe(true);
      expect(adminBody.entries.every((e) => e.canEdit === true)).toBe(true);
    });
  });
});
