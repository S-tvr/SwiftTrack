import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { resetDatabase } from './helpers/db';
import {
  createActivatedEmployee,
  loginAsAdmin,
  login,
} from './helpers/fixtures';
import type { ErrorBody } from './helpers/types';

/**
 * `PATCH /auth/change-password` — the gap login/set-initial-password left
 * open: an already-activated account had no self-service way to rotate or
 * recover its password. Real-database coverage on top of
 * `auth.service.spec.ts`'s stubbed-Prisma tests, in the shape of
 * `activation.e2e-spec.ts`: the guard is actually wired, the row actually
 * changes, and both roles can reach it.
 */

const INVALID_CURRENT_PASSWORD = 'Your current password is incorrect.';

describe('PATCH /auth/change-password', () => {
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
    await request(server)
      .patch('/auth/change-password')
      .send({ currentPassword: 'x', newPassword: 'a-new-password' })
      .expect(401);
  });

  it('rejects a newPassword under 8 characters with 400', async () => {
    await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: 'irrelevant', newPassword: 'short' })
      .expect(400);
  });

  it('rejects an unexpected body property via the global ValidationPipe', async () => {
    await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        currentPassword: process.env.ADMIN_PASSWORD,
        newPassword: 'a-new-password',
        role: 'ADMIN',
      })
      .expect(400);
  });

  it('rejects a wrong current password with 401 INVALID_CURRENT_PASSWORD, and changes nothing', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    const response = await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ currentPassword: 'not-it', newPassword: 'a-new-password' })
      .expect(401);

    expect((response.body as ErrorBody).code).toBe('INVALID_CURRENT_PASSWORD');
    expect((response.body as ErrorBody).message).toBe(INVALID_CURRENT_PASSWORD);

    // The old password still works — a rejected attempt must not disturb it.
    await login(server, employee.email, employee.password);
  });

  it('changes the password for an EMPLOYEE, end to end', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        currentPassword: employee.password,
        newPassword: 'a-brand-new-password',
      })
      .expect(200);

    // The old password is now rejected...
    await request(server)
      .post('/auth/login')
      .send({ email: employee.email, password: employee.password })
      .expect(401);

    // ...and the new one works.
    await login(server, employee.email, 'a-brand-new-password');
  });

  // ⚠️ The seeded admin is a shared fixture `resetDatabase` deliberately does
  // NOT reset between tests (see helpers/db.ts) — every other spec file's
  // `loginAsAdmin()` depends on ADMIN_PASSWORD still working. This test
  // therefore changes the password and then changes it straight back, rather
  // than leaving the mutation for `resetDatabase` to undo (it won't).
  it('changes the password for the ADMIN, end to end', async () => {
    const adminEmail = process.env.ADMIN_EMAIL as string;
    const adminPassword = process.env.ADMIN_PASSWORD as string;
    const tempPassword = 'temporary-admin-pass';

    await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: adminPassword, newPassword: tempPassword })
      .expect(200);

    await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(401);

    const tempToken = await login(server, adminEmail, tempPassword);

    // Restore it, using the endpoint itself — leaves the shared fixture
    // exactly as every other spec file assumes it still is.
    await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ currentPassword: tempPassword, newPassword: adminPassword })
      .expect(200);

    await login(server, adminEmail, adminPassword);
  });

  it('never touches setupCode/setupCodeExpiresAt — this is not activation', async () => {
    const employee = await createActivatedEmployee(server, adminToken);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: employee.id },
    });

    await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        currentPassword: employee.password,
        newPassword: 'a-brand-new-password',
      })
      .expect(200);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: employee.id },
    });
    expect(after.setupCode).toBe(before.setupCode);
    expect(after.setupCodeExpiresAt).toEqual(before.setupCodeExpiresAt);
    expect(after.password).not.toBe(before.password);
  });

  it('is not rate limited — SkipThrottle, unlike login and set-initial-password', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    // 6 would 429 on login's 5-per-60s bucket; this route must ignore it.
    for (let i = 0; i < 6; i++) {
      await request(server)
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          currentPassword: 'wrong-on-purpose',
          newPassword: 'x'.repeat(8),
        })
        .expect(401);
    }
  });
});
