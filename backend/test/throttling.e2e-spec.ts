import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { resetDatabase } from './helpers/db';

/**
 * The **only** spec that leaves the real `ThrottlerGuard` in place.
 *
 * Every other spec overrides it (see `CreateTestAppOptions.throttling`): the
 * limit is 5 requests per 60s per IP and the whole suite shares one IP, so
 * leaving it on everywhere would sprinkle 429s across tests that are asserting
 * something else entirely. Proving it once, deliberately, is both cheaper and
 * more honest than proving it accidentally in twenty places.
 *
 * Rate limiting is not cosmetic here: `set-initial-password` is unauthenticated
 * and the setup code is 4 digits — 9,000 combinations against guessable emails.
 *
 * ⚠️ This file exhausts the login bucket on purpose, and the bucket lasts 60
 * seconds. It gets its own app instance (so its own in-memory throttler
 * storage) and must not log in for any other reason.
 */
describe('rate limiting on the unauthenticated auth routes', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, server, prisma } = await createTestApp({ throttling: true }));
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const attemptLogin = () =>
    request(server)
      .post('/auth/login')
      .send({ email: 'nobody@e2e.local', password: 'wrong-password' });

  it('answers 429 after 5 login attempts in 60 seconds', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      statuses.push((await attemptLogin()).status);
    }

    // The first five are rejected on their merits, not by the throttler.
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  /**
   * Separate bucket per route — otherwise a burst of failed logins would lock
   * an employee out of activating their account, which is a different action
   * with a different risk.
   */
  it('keeps set-initial-password on its own bucket', async () => {
    // Exhausts the login bucket itself rather than relying on the test above
    // having run. Order-dependent tests are fine until someone reaches for
    // `-t` to debug one of them, and then they fail for a reason that points
    // nowhere near the cause. Idempotent: if the bucket is already spent, the
    // first request here is already a 429 and the loop stops.
    let loginStatus = 0;
    for (let i = 0; i < 7 && loginStatus !== 429; i += 1) {
      loginStatus = (await attemptLogin()).status;
    }
    expect(loginStatus).toBe(429);

    const response = await request(server)
      .post('/auth/set-initial-password')
      .send({
        email: 'nobody@e2e.local',
        setupCode: '1234',
        newPassword: 'a-good-password',
      });

    expect(response.status).not.toBe(429);
    expect(response.status).toBe(404);
  });
});
