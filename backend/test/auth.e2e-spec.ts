import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { resetDatabase } from './helpers/db';
import type { ErrorBody, LoginBody, UserBody } from './helpers/types';

/**
 * Harness proof (build-plan §8b, first pass).
 *
 * These four tests are not about business rules — the rest of the suite is.
 * Each one proves a different layer of the harness is actually wired, so that
 * when the ~20 behavioural tests are added, a red result means the code is
 * wrong rather than the setup. The project has three recorded measurement
 * errors so far (steps 5, 6 and 7) and all three were the harness, never the
 * code; this file exists so that stops being discovered the expensive way.
 */
describe('e2e harness (auth, guards, pipe)', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;

  const adminEmail = process.env.ADMIN_EMAIL as string;
  const adminPassword = process.env.ADMIN_PASSWORD as string;

  const employee = {
    name: 'Smoke Employee',
    email: 'smoke.employee@e2e.local',
    hourlyRate: 2450,
    password: 'employee-password',
  };

  beforeAll(async () => {
    ({ app, server, prisma } = await createTestApp());
    await resetDatabase(prisma);

    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    adminToken = (adminLogin.body as LoginBody).accessToken;

    // An employee is created and activated so there is a non-admin token to
    // prove RolesGuard with. This also exercises the onboarding flow end to
    // end (spec §5) as a side effect, which is why it is worth doing for real
    // rather than inserting a row with Prisma.
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: employee.name,
        email: employee.email,
        hourlyRate: employee.hourlyRate,
      })
      .expect(201);

    await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: employee.email,
        setupCode: (created.body as UserBody).setupCode,
        newPassword: employee.password,
      })
      .expect(200);

    const employeeLogin = await request(server)
      .post('/auth/login')
      .send({ email: employee.email, password: employee.password })
      .expect(200);
    employeeToken = (employeeLogin.body as LoginBody).accessToken;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  // Proves the whole chain in one request: the test database exists, the
  // migrations applied, the seed ran, bcrypt matches, and a JWT is issued.
  it('logs the seeded admin in and returns a token plus the user', async () => {
    const response = await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    const body = response.body as LoginBody;
    expect(typeof body.accessToken).toBe('string');
    expect(body.user).toMatchObject({ email: adminEmail, role: 'ADMIN' });
    // The self-facing DTO never carries a setup code (architecture.md
    // § Invariants — response DTOs are not reused across trust boundaries).
    expect(body.user).not.toHaveProperty('setupCode');
  });

  // Proves JwtAuthGuard is executing, not merely present in the source.
  it('rejects an unauthenticated request with 401', async () => {
    await request(server).get('/users').expect(401);
  });

  // Proves RolesGuard is executing and reading the role.
  it('rejects an EMPLOYEE from an ADMIN-only route with 403', async () => {
    await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });

  // The most important of the four: the global ValidationPipe lives in main.ts,
  // which a testing app never runs. If helpers/app.ts stopped re-applying it,
  // this body would be accepted and every later validation assertion in the
  // suite would pass for the wrong reason.
  it('rejects an unknown field via the global ValidationPipe (password on POST /users)', async () => {
    const response = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rejected',
        email: 'rejected@e2e.local',
        hourlyRate: 2000,
        password: 'should-not-be-accepted',
      })
      .expect(400);

    const body = response.body as ErrorBody;
    expect(JSON.stringify(body.message)).toContain('password');
  });
});
