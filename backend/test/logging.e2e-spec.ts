import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { resetDatabase } from './helpers/db';
import { createActivatedEmployee, loginAsAdmin } from './helpers/fixtures';
import type { ErrorBody } from './helpers/types';

/**
 * The one property `AllExceptionsFilter` had to prove: **the API answers exactly
 * what it answered before.** `domain-errors.ts` rejected a filter in this
 * position, and reopening that was allowed only on the condition that it never
 * writes a body — a condition nobody checks is a wish.
 *
 * ⚠️ Depends on `helpers/app.ts` re-registering the filter, since a testing app
 * never runs `main.ts`. Drop that line and these keep passing while proving
 * nothing.
 */
describe('Step 17 — the exception filter leaves the contract alone', () => {
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

  it('a domain 400 keeps its statusCode, code and message', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    const shift = {
      userId: employee.id,
      startTime: '2026-07-01T08:00:00.000Z',
      endTime: '2026-07-01T16:00:00.000Z',
    };

    await request(server)
      .post('/time-entries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(shift)
      .expect(201);

    // Overlaps the one above — the rule from build-plan §5.
    const response = await request(server)
      .post('/time-entries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...shift,
        startTime: '2026-07-01T12:00:00.000Z',
        endTime: '2026-07-01T20:00:00.000Z',
      })
      .expect(400);

    const body = response.body as ErrorBody;
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe('SHIFT_OVERLAP');
    expect(typeof body.message).toBe('string');
  });

  it('a domain 401 from login is unchanged, and does not log the user out of anything', async () => {
    const response = await request(server)
      .post('/auth/login')
      .send({ email: 'nobody@e2e.local', password: 'wrong-password' })
      .expect(401);

    const body = response.body as ErrorBody;
    expect(body.statusCode).toBe(401);
    expect(body.code).toBe('INVALID_CREDENTIALS');
  });

  it('a domain 404 still hides whether the row exists', async () => {
    const response = await request(server)
      .get('/payroll/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect((response.body as ErrorBody).code).toBe('EMPLOYEE_NOT_FOUND');
  });

  it('a ValidationPipe 400 still carries no code, and the pipe is still what answers', async () => {
    // The framework-built half of the contract — the shape a filter that
    // started deciding bodies would be likeliest to change.
    const response = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', email: 'not-an-email', hourlyRate: 2450 })
      .expect(400);

    const body = response.body as ErrorBody;
    expect(body.statusCode).toBe(400);
    expect(body.code).toBeUndefined();
    expect(Array.isArray(body.message)).toBe(true);
  });

  it('a guard 401 with no token is unchanged', async () => {
    await request(server).get('/users').expect(401);
  });

  it('a guard 403 for the wrong role is unchanged', async () => {
    const employee = await createActivatedEmployee(server, adminToken);

    await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(403);
  });

  it('a success is still a success — the filter is not in that path at all', async () => {
    await request(server)
      .get('/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
