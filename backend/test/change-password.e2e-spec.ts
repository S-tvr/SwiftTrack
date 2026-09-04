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
const SAME_AS_CURRENT =
  'Your new password must be different from your current one.';

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

  // ⚠️ 400, not 401, and the status is the point of the test as much as the
  // code is. `api/client.ts` logs the user out on any 401 that carried a token
  // — by a deliberate rule keyed off the Authorization header rather than a
  // list of endpoints — and this route must send one. A 401 here threw the user
  // out of the app for a typo and told them their session had expired (8f).
  it('rejects a wrong current password with 400 INVALID_CURRENT_PASSWORD, and changes nothing', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    const response = await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ currentPassword: 'not-it', newPassword: 'a-new-password' })
      .expect(400);

    expect((response.body as ErrorBody).code).toBe('INVALID_CURRENT_PASSWORD');
    expect((response.body as ErrorBody).message).toBe(INVALID_CURRENT_PASSWORD);

    // The old password still works — a rejected attempt must not disturb it.
    await login(server, employee.email, employee.password);
    // ...and neither must it revoke the session that made the attempt.
    await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200);
  });

  it('rejects a newPassword identical to the current one with 400', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    const response = await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        currentPassword: employee.password,
        newPassword: employee.password,
      })
      .expect(400);

    expect((response.body as ErrorBody).code).toBe(
      'NEW_PASSWORD_SAME_AS_CURRENT',
    );
    expect((response.body as ErrorBody).message).toBe(SAME_AS_CURRENT);
  });

  it('changes the password for an EMPLOYEE, end to end', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    const response = await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        currentPassword: employee.password,
        newPassword: 'a-brand-new-password',
      })
      .expect(200);

    // The replacement token is the only thing the body carries — no profile,
    // which the caller already had, and certainly no password field.
    expect(Object.keys(response.body as object)).toEqual(['accessToken']);

    // The old password is now rejected...
    await request(server)
      .post('/auth/login')
      .send({ email: employee.email, password: employee.password })
      .expect(401);

    // ...and the new one works.
    await login(server, employee.email, 'a-brand-new-password');
  });

  // ⭐ The test the revocation half of 8f exists for. Two live sessions for one
  // user — the shape of "I changed my password because someone else has it".
  it('revokes every token issued before the change, and hands back a working replacement', async () => {
    const employee = await createActivatedEmployee(server, adminToken);
    // A second device, signed in with the same credentials.
    const otherDevice = await login(server, employee.email, employee.password);

    const response = await request(server)
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        currentPassword: employee.password,
        newPassword: 'a-brand-new-password',
      })
      .expect(200);

    const replacement = (response.body as { accessToken: string }).accessToken;

    // The other device is out on its very next request — the whole point.
    await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${otherDevice}`)
      .expect(401);

    // So is the token that made the change: revocation is not selective, which
    // is exactly why a replacement has to come back in the body.
    await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(401);

    // And the replacement works, so the session that did the change survives.
    await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${replacement}`)
      .expect(200);
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
    // Exactly one bump, in the same UPDATE as the hash (step 8f).
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
  });

  it('is not rate limited — SkipThrottle, unlike login and set-initial-password', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    // 6 would 429 on login's 5-per-60s bucket; this route must ignore it.
    // 400 rather than 429 is what proves it: a throttled request never reaches
    // the service, so it could not answer with a domain status at all.
    for (let i = 0; i < 6; i++) {
      await request(server)
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          currentPassword: 'wrong-on-purpose',
          newPassword: 'x'.repeat(8),
        })
        .expect(400);
    }
  });
});
