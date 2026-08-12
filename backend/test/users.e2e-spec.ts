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
    type Method = 'get' | 'post' | 'put' | 'delete';

    /**
     * The `:id` routes point at a row that genuinely exists, so a 403 can only
     * have come from `RolesGuard` rather than from the row being absent.
     */
    const routesFor = (id: number): Array<[string, Method, string]> => [
      ['GET /users', 'get', '/users'],
      ['POST /users', 'post', '/users'],
      ['PUT /users/:id', 'put', `/users/${id}`],
      ['DELETE /users/:id', 'delete', `/users/${id}`],
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
   * checks `isActive`, there is no reactivation endpoint and no public register
   * route. The role filter lives in the service lookup.
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
