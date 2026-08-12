import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { resetDatabase } from './helpers/db';
import {
  createActivatedEmployee,
  loginAsAdmin,
  type ActivatedEmployee,
} from './helpers/fixtures';
import type { SettingsBody } from './helpers/types';

describe('/settings, DB constraints and CORS', () => {
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

  it('is readable by both roles, writable only by ADMIN', async () => {
    await request(server).get('/settings').expect(401);

    for (const token of [adminToken, employee.token]) {
      const response = await request(server)
        .get('/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body as SettingsBody).toEqual({
        cycleStartDay: 25,
        cycleEndDay: 24,
      });
    }

    await request(server)
      .put('/settings')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ cycleStartDay: 11, cycleEndDay: 10 })
      .expect(403);
  });

  it('accepts a contiguous in-range pair and actually persists it', async () => {
    await request(server)
      .put('/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cycleStartDay: 11, cycleEndDay: 10 })
      .expect(200);

    const readBack = await request(server)
      .get('/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(readBack.body as SettingsBody).toEqual({
      cycleStartDay: 11,
      cycleEndDay: 10,
    });
  });

  /**
   * The 11–25 restriction is what makes consecutive cycles contiguous and
   * removes day-of-month clamping entirely. The admin UI (step 13) will offer
   * only valid pairs, but Swagger UI is literally a form for hand-made
   * requests — the two are layers, not duplicates.
   */
  it.each([
    ['non-contiguous', { cycleStartDay: 25, cycleEndDay: 20 }],
    ['below the range', { cycleStartDay: 10, cycleEndDay: 9 }],
    ['above the range', { cycleStartDay: 26, cycleEndDay: 25 }],
    ['end after start', { cycleStartDay: 25, cycleEndDay: 26 }],
  ])('rejects a %s pair with 400', async (_, payload) => {
    await request(server)
      .put('/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(400);
  });

  it.each([
    ['a missing field', { cycleStartDay: 25 }],
    ['a non-integer', { cycleStartDay: 25.5, cycleEndDay: 24.5 }],
    ['a string', { cycleStartDay: '25', cycleEndDay: '24' }],
    ['an undeclared property', { cycleStartDay: 25, cycleEndDay: 24, nope: 1 }],
  ])('rejects %s with 400', async (_, payload) => {
    await request(server)
      .put('/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(400);
  });

  /**
   * §8b point 3 — a constraint that lives only in the database. Application
   * code always reads and writes `id: 1`, so nothing above this layer would
   * ever notice if the CHECK were dropped.
   */
  it('refuses a second AppSettings row at the database level', async () => {
    await expect(
      prisma.appSettings.create({
        data: { id: 2, cycleStartDay: 25, cycleEndDay: 24 },
      }),
    ).rejects.toThrow();

    expect(await prisma.appSettings.count()).toBe(1);
  });

  /**
   * The step-1 lesson: `main.ts` falls back to `http://localhost:5173`, so a
   * CORS check against that value proves nothing about whether the env var is
   * read at all. `.env.test` therefore sets a deliberately different origin.
   */
  describe('CORS', () => {
    const configuredOrigin = process.env.FRONTEND_URL as string;

    it('is configured from the environment, not the hardcoded fallback', () => {
      expect(configuredOrigin).toBeDefined();
      expect(configuredOrigin).not.toBe('http://localhost:5173');
    });

    it('reflects the configured origin back', async () => {
      const response = await request(server)
        .get('/settings')
        .set('Origin', configuredOrigin)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(
        configuredOrigin,
      );
    });

    /**
     * With a static `origin` string, `cors` emits that value unconditionally
     * and never compares it against the request — enforcement happens in the
     * browser, which refuses a response whose header does not match where it
     * came from. So the meaningful assertion is not "no header" but "never the
     * caller's own origin": if `origin` were ever loosened to `true` or to a
     * reflecting function, the header below would become the foreign origin
     * and every site on the internet could read authenticated responses.
     */
    it('never echoes back a foreign origin', async () => {
      const foreignOrigin = 'http://not-our-frontend.test:1234';

      const response = await request(server)
        .get('/settings')
        .set('Origin', foreignOrigin)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).not.toBe(
        foreignOrigin,
      );
      expect(response.headers['access-control-allow-origin']).toBe(
        configuredOrigin,
      );
    });
  });
});
