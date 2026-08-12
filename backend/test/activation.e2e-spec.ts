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
import type { ErrorBody } from './helpers/types';

/**
 * The activation and login paths of spec §5 / §9.
 *
 * Messages are asserted **verbatim**, as everywhere else in the suite. What
 * changed on 2026-08-11 is only that spec §8a stopped being the authority the
 * code must match — the table records the wording rather than dictating it.
 * The tests are still the regression net: changing one of these sentences
 * should be a deliberate edit that shows up here.
 *
 * The order of the checks is the security property, and `AuthService` has
 * already been wrong at exactly this spot once (a missing `isActive` check,
 * found by review in step 3, not by any test).
 */

const DEACTIVATED = 'This account is no longer active.';
const NOT_ACTIVATED =
  "This account hasn't been activated yet. Please activate it first.";
describe('activation and login', () => {
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

  it('rejects a wrong setup code with 401 and does NOT consume the code', async () => {
    const pending = await createPendingEmployee(server, adminToken);
    const wrongCode = pending.setupCode === '0000' ? '1111' : '0000';

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: pending.email,
        setupCode: wrongCode,
        newPassword: 'a-good-password',
      })
      .expect(401);

    // The real code still works afterwards — a failed attempt must not burn it.
    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: pending.email,
        setupCode: pending.setupCode,
        newPassword: 'a-good-password',
      })
      .expect(200);
  });

  it('rejects an expired setup code with 401', async () => {
    const pending = await createPendingEmployee(server, adminToken);

    await prisma.user.update({
      where: { id: pending.id },
      data: { setupCodeExpiresAt: new Date(Date.now() - 1000) },
    });

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: pending.email,
        setupCode: pending.setupCode,
        newPassword: 'a-good-password',
      })
      .expect(401);
  });

  it('rejects re-activating an already activated account with 409', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: employee.email,
        setupCode: '1234',
        newPassword: 'another-password',
      })
      .expect(409);
  });

  it('rejects activating a deactivated account with 401, code untouched', async () => {
    const pending = await createPendingEmployee(server, adminToken);

    await request(server)
      .delete(`/users/${pending.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: pending.email,
        setupCode: pending.setupCode,
        newPassword: 'a-good-password',
      })
      .expect(401);

    // Still pending: the blocked attempt wrote nothing.
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(row.password).toBeNull();
    expect(row.setupCode).not.toBeNull();
  });

  it('clears setupCode AND setupCodeExpiresAt together on activation', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: employee.id },
    });
    expect(row.setupCode).toBeNull();
    expect(row.setupCodeExpiresAt).toBeNull();
    expect(row.password).not.toBeNull();
  });

  it('refuses login before activation, and distinguishes it from a wrong password', async () => {
    const pending = await createPendingEmployee(server, adminToken);

    const notActivated = await request(server)
      .post('/auth/login')
      .send({ email: pending.email, password: 'anything-at-all' })
      .expect(401);

    // The two cases need different actions from the user, so they must not
    // collapse into one generic answer (architecture.md § Invariants).
    expect((notActivated.body as ErrorBody).message).toBe(NOT_ACTIVATED);
  });

  it('refuses login for a deactivated account, and says so', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    await request(server)
      .delete(`/users/${employee.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const response = await request(server)
      .post('/auth/login')
      .send({ email: employee.email, password: employee.password })
      .expect(401);

    expect((response.body as ErrorBody).message).toBe(DEACTIVATED);
  });

  it('answers 401 (never 404) for an unknown email on login', async () => {
    await request(server)
      .post('/auth/login')
      .send({ email: 'nobody@e2e.local', password: 'whatever' })
      .expect(401);
  });

  it('validates the setup code shape before comparing it (400, not 401)', async () => {
    const pending = await createPendingEmployee(server, adminToken);

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: pending.email,
        setupCode: '123',
        newPassword: 'a-good-password',
      })
      .expect(400);

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: pending.email,
        setupCode: pending.setupCode,
        newPassword: 'short',
      })
      .expect(400);
  });
});
