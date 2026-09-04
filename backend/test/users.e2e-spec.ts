import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { resetDatabase } from './helpers/db';
import {
  createActivatedEmployee,
  createPendingEmployee,
  loginAsAdmin,
  uniqueEmail,
} from './helpers/fixtures';
import type { ErrorBody, UserBody } from './helpers/types';

describe('/users', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, server, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    adminToken = await loginAsAdmin(server);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  /**
   * §8b point 1: that `@Roles(ADMIN)` and `JwtAuthGuard` are wired and running
   * on **each** route, not merely present in the source. A unit test cannot see
   * this at all — instantiating a controller directly runs no guard.
   */
  describe('guards are executing on every route', () => {
    type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

    /**
     * The `:id` routes point at a row that genuinely exists, so a 403 can only
     * have come from `RolesGuard` rather than from the row being absent.
     */
    const routesFor = (id: number): Array<[string, Method, string]> => [
      ['GET /users', 'get', '/users'],
      ['POST /users', 'post', '/users'],
      ['PUT /users/:id', 'put', `/users/${id}`],
      ['DELETE /users/:id', 'delete', `/users/${id}`],
      ['PATCH /users/:id/reactivate', 'patch', `/users/${id}/reactivate`],
      [
        'POST /users/:id/reset-setup-code',
        'post',
        `/users/${id}/reset-setup-code`,
      ],
      ['POST /users/:id/reset-password', 'post', `/users/${id}/reset-password`],
    ];

    // No token means no row is ever reached, so the id here is irrelevant.
    it.each(routesFor(1))(
      '%s answers 401 without a token',
      async (_, method, url) => {
        await request(server)[method](url).expect(401);
      },
    );

    it('answers 403 for an EMPLOYEE on every ADMIN-only route', async () => {
      const employee = await createActivatedEmployee(server, adminToken);

      for (const [, method, url] of routesFor(employee.id)) {
        await request(server)
          [method](url)
          .set('Authorization', `Bearer ${employee.token}`)
          .expect(403);
      }
    });
  });

  it('GET /users/me works for both roles and never leaks setupCode', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    const asAdmin = await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(asAdmin.body).not.toHaveProperty('setupCode');

    const asEmployee = await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200);
    expect(asEmployee.body).not.toHaveProperty('setupCode');
    expect((asEmployee.body as UserBody).email).toBe(employee.email);
  });

  /**
   * The unique index behind the 409 is a **database** constraint (§8b point 3).
   * The service checks first, but that check has a TOCTOU window the `P2002`
   * catch closes — and only a real database can tell them apart.
   */
  it('rejects a duplicate email with 409', async () => {
    const email = uniqueEmail('duplicate');
    await createPendingEmployee(server, adminToken, { email });

    await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Second', email, hourlyRate: 3000 })
      .expect(409);
  });

  it('rejects concurrent creates of the same email with exactly one 201', async () => {
    const email = uniqueEmail('race');

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(server)
          .post('/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Racer', email, hourlyRate: 2000 }),
      ),
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
    // No unhandled Prisma error may escape as a 500 — that is what the P2002
    // catch exists for.
    expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
  });

  it('returns a setupCode for a pending employee and clears it on activation', async () => {
    const pending = await createPendingEmployee(server, adminToken);
    expect(pending.setupCode).toMatch(/^\d{4}$/);
    expect(pending.hasActivated).toBe(false);

    const employee = await createActivatedEmployee(server, adminToken);
    const list = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const activated = (list.body as UserBody[]).find(
      (u) => u.id === employee.id,
    );
    expect(activated?.setupCode).toBeNull();
    expect(activated?.hasActivated).toBe(true);
  });

  /**
   * Deactivating the only admin would be unrecoverable through the API: login
   * checks `isActive`, there is no public register route, and `reactivate`
   * (step 8c) is EMPLOYEE-only for exactly this reason — it is no way back in.
   * The role filter lives in the service lookup.
   */
  it('refuses to update or deactivate an ADMIN row (404)', async () => {
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: 'ADMIN' },
    });

    await request(server)
      .put(`/users/${admin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed', hourlyRate: 5000 })
      .expect(404);

    await request(server)
      .delete(`/users/${admin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
    });
    expect(after.isActive).toBe(true);
    expect(after.hourlyRate).toBeNull();
  });

  it('DELETE is a soft delete — the row survives with isActive false', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    await request(server)
      .delete(`/users/${employee.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: employee.id },
    });
    expect(row.isActive).toBe(false);

    // Still listed — the frontend decides how to show them.
    const list = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((list.body as UserBody[]).some((u) => u.id === employee.id)).toBe(
      true,
    );
  });

  /**
   * A token issued before deactivation must stop working immediately —
   * `JwtStrategy` re-reads the user on every request. This is the invariant
   * that replaced the original "trust the payload" decision in step 3.
   */
  it('invalidates an already-issued token the moment the user is deactivated', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200);

    await request(server)
      .delete(`/users/${employee.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(401);
  });

  /**
   * The two recovery paths added in step 8c, against real rows. Both close
   * situations that were previously unrecoverable through the API: an admin's
   * only remedy was editing the database by hand.
   */
  describe('the recovery endpoints', () => {
    it('reactivates a deactivated employee, and login works again', async () => {
      const employee = await createActivatedEmployee(server, adminToken);

      await request(server)
        .delete(`/users/${employee.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // The whole point: deactivation used to be a one-way door.
      await request(server)
        .post('/auth/login')
        .send({ email: employee.email, password: employee.password })
        .expect(401);

      const response = await request(server)
        .patch(`/users/${employee.id}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((response.body as UserBody).isActive).toBe(true);
      await request(server)
        .post('/auth/login')
        .send({ email: employee.email, password: employee.password })
        .expect(200);
    });

    it('refuses to reactivate an ADMIN row, like PUT and DELETE', async () => {
      const admin = await prisma.user.findFirstOrThrow({
        where: { role: 'ADMIN' },
      });

      const response = await request(server)
        .patch(`/users/${admin.id}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect((response.body as ErrorBody).code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it('issues a new setup code that actually activates the account', async () => {
      // The dead end this closes: the original code lives 3 days and was issued
      // exactly once, so anyone who did not activate in time was locked out for
      // good — while being told to "contact your admin", who had no tool.
      const pending = await createPendingEmployee(server, adminToken);

      // Expire the original the way real time would.
      await prisma.user.update({
        where: { id: pending.id },
        data: { setupCodeExpiresAt: new Date('2020-01-01T00:00:00.000Z') },
      });
      const expired = await request(server)
        .post('/auth/set-initial-password')
        .send({
          email: pending.email,
          setupCode: pending.setupCode,
          newPassword: 'a-new-password',
        })
        .expect(401);
      expect((expired.body as ErrorBody).code).toBe('SETUP_CODE_EXPIRED');

      const reissued = await request(server)
        .post(`/users/${pending.id}/reset-setup-code`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = reissued.body as UserBody;
      expect(body.setupCode).toMatch(/^\d{4}$/);
      expect(body.setupCode).not.toBe(pending.setupCode);
      expect(new Date(body.setupCodeExpiresAt!).getTime()).toBeGreaterThan(
        Date.now(),
      );

      await request(server)
        .post('/auth/set-initial-password')
        .send({
          email: pending.email,
          setupCode: body.setupCode,
          newPassword: 'a-new-password',
        })
        .expect(200);
    });

    it('refuses to re-issue a code once the account is activated', async () => {
      const employee = await createActivatedEmployee(server, adminToken);

      const response = await request(server)
        .post(`/users/${employee.id}/reset-setup-code`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect((response.body as ErrorBody).code).toBe(
        'ACCOUNT_ALREADY_ACTIVATED',
      );
    });
  });

  /**
   * The Team page prints "Valid until 29 August" — a date, not a duration — in
   * the dialog shown after creating an employee and on every pending row. That
   * is impossible unless the expiry travels with the code, and this is the same
   * class of gap as `setupCode` itself being absent from the response.
   */
  it('returns setupCodeExpiresAt beside the code, and clears both on activation', async () => {
    const pending = await createPendingEmployee(server, adminToken);

    expect(pending.setupCode).toMatch(/^\d{4}$/);
    const expiry = new Date(pending.setupCodeExpiresAt!).getTime();
    expect(expiry).toBeGreaterThan(Date.now());
    // Three days, give or take the round trip.
    expect(expiry - Date.now()).toBeLessThan(3 * 86_400_000 + 60_000);

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: pending.email,
        setupCode: pending.setupCode,
        newPassword: 'a-new-password',
      })
      .expect(200);

    const list = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const activated = (list.body as UserBody[]).find(
      (u) => u.id === pending.id,
    )!;
    // Never one without the other.
    expect(activated.setupCode).toBeNull();
    expect(activated.setupCodeExpiresAt).toBeNull();
  });

  it('rejects a password field on POST /users via the ValidationPipe', async () => {
    const response = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Nope',
        email: uniqueEmail('nopassword'),
        hourlyRate: 2000,
        password: 'should-not-be-accepted',
      })
      .expect(400);

    expect(JSON.stringify((response.body as ErrorBody).message)).toContain(
      'password',
    );
  });
});
