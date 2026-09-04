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
} from './helpers/fixtures';
import type { ErrorBody, UserBody } from './helpers/types';

/**
 * `POST /users/:id/reset-password` (step 8g) — the gap neither existing
 * password route reaches: `change-password` needs the current one,
 * `reset-setup-code` refuses once a password exists. Real-database coverage
 * on top of `users.service.spec.ts`'s stubbed-Prisma tests, in the shape of
 * `reset-setup-code`'s own e2e coverage plus 8f's two-session revocation
 * pattern.
 *
 * The 8e fixture hazard (`resetDatabase` never resetting the seeded ADMIN
 * row) cannot recur here: this route refuses ADMIN ids by design, so no test
 * below ever calls it against the shared admin fixture.
 */

describe('POST /users/:id/reset-password', () => {
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

  it('rejects an unauthenticated request with 401', async () => {
    await request(server).post('/users/1/reset-password').expect(401);
  });

  it('rejects an EMPLOYEE caller with 403', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    await request(server)
      .post(`/users/${employee.id}/reset-password`)
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(403);
  });

  it('404s a non-integer id', async () => {
    await request(server)
      .post('/users/not-a-number/reset-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('404s an ADMIN id, like PUT/DELETE/reactivate/reset-setup-code', async () => {
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: 'ADMIN' },
    });

    const response = await request(server)
      .post(`/users/${admin.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect((response.body as ErrorBody).code).toBe('EMPLOYEE_NOT_FOUND');
  });

  it('resets an activated employee end to end: old password dead, new code activates', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    const response = await request(server)
      .post(`/users/${employee.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as UserBody;
    expect(body.hasActivated).toBe(false);
    expect(body.setupCode).toMatch(/^\d{4}$/);
    expect(new Date(body.setupCodeExpiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // The old password no longer works, and specifically because the account
    // reads as never-activated — proving password actually went to null,
    // not merely that the old value stopped matching.
    const oldLogin = await request(server)
      .post('/auth/login')
      .send({ email: employee.email, password: employee.password })
      .expect(401);
    expect((oldLogin.body as ErrorBody).code).toBe('ACCOUNT_NOT_ACTIVATED');

    // The new code activates a freshly chosen password, exactly as at
    // account creation.
    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: employee.email,
        setupCode: body.setupCode,
        newPassword: 'a-brand-new-password',
      })
      .expect(200);

    await request(server)
      .post('/auth/login')
      .send({ email: employee.email, password: 'a-brand-new-password' })
      .expect(200);
  });

  // ⭐ Reuses 8f's revocation mechanism rather than a new one — a reset the
  // account holder did not initiate is at least as strong a reason to kill
  // their sessions as a voluntary change is.
  it('revokes every token already issued for the account', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200);

    await request(server)
      .post(`/users/${employee.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Out on the very next request — no replacement token here, unlike
    // change-password: the caller is the admin, not the employee, who has no
    // session for this call to preserve.
    await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(401);
  });

  // ⚠️ Deliberate overlap with reset-setup-code: this endpoint has no guard
  // to refuse a pending row, so it produces the same outcome that endpoint
  // already gives, rather than pointing the admin somewhere else for no gain.
  it('also succeeds on a still-pending (never activated) employee', async () => {
    const pending = await createPendingEmployee(server, adminToken);

    const response = await request(server)
      .post(`/users/${pending.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as UserBody;
    expect(body.hasActivated).toBe(false);
    expect(body.setupCode).toMatch(/^\d{4}$/);
    expect(body.setupCode).not.toBe(pending.setupCode);

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: pending.email,
        setupCode: body.setupCode,
        newPassword: 'a-new-password',
      })
      .expect(200);
  });

  // ⚠️ Succeeds without implicitly reactivating — login's existing check
  // order (ACCOUNT_DEACTIVATED before ACCOUNT_NOT_ACTIVATED) already makes
  // the reset inert until a separate PATCH .../reactivate call.
  it('succeeds on a deactivated employee, but the reset stays inert until reactivated', async () => {
    const employee = await createActivatedEmployee(server, adminToken);
    await request(server)
      .delete(`/users/${employee.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const response = await request(server)
      .post(`/users/${employee.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as UserBody;
    expect(body.isActive).toBe(false);
    expect(body.setupCode).toMatch(/^\d{4}$/);

    const attempt = await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: employee.email,
        setupCode: body.setupCode,
        newPassword: 'a-new-password',
      })
      .expect(401);
    expect((attempt.body as ErrorBody).code).toBe('ACCOUNT_DEACTIVATED');

    // Reactivating unblocks it, using the fresh code already issued.
    await request(server)
      .patch(`/users/${employee.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: employee.email,
        setupCode: body.setupCode,
        newPassword: 'a-new-password',
      })
      .expect(200);
  });
});
