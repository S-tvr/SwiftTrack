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
  type ActivatedEmployee,
} from './helpers/fixtures';
import type {
  CycleEntriesBody,
  OpenShiftBody,
  TimeEntryBody,
} from './helpers/types';

// A Monday comfortably in the past — rule 4 forbids future timestamps, so every
// fixture shift has to have already happened.
const MON = '2026-08-03';

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
      await addShift(server, employee.token, {
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
  });
});
