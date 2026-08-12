import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { resetDatabase } from './helpers/db';
import {
  addShift,
  createActivatedEmployee,
  loginAsAdmin,
  type ActivatedEmployee,
} from './helpers/fixtures';
import type { PayrollBody, PayrollOverviewBody } from './helpers/types';

const RATE = 2450;
// 2450 x 1.33 and 2450 x 1.45 — a whole-ISK rate times either factor lands
// exactly on hundredths, which is why a zone rate is never rounded.
const EVENING_RATE = 3258.5;
const NIGHT_RATE = 3552.5;
const WEEKEND_RATE = 3552.5;

describe('/payroll', () => {
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
    employee = await createActivatedEmployee(server, adminToken, {
      hourlyRate: RATE,
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const payrollFor = async (
    cycle: string,
    token = employee.token,
  ): Promise<PayrollBody> => {
    const response = await request(server)
      .get(`/payroll/me?cycle=${cycle}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as PayrollBody;
  };

  const zone = (body: PayrollBody, key: string) => {
    const found = body.zones.find((z) => z.zone === key);
    if (!found) {
      // A non-null assertion here would surface a missing zone as a TypeError
      // on some unrelated property, several lines from the real problem.
      throw new Error(
        `No "${key}" zone in the response. Got: ${body.zones.map((z) => z.zone).join(', ')}`,
      );
    }
    return found;
  };

  /**
   * ⭐ A shift crossing the cycle boundary is **split**, not assigned wholesale
   * to the cycle of its startTime. The two parts must sum to the hours actually
   * worked: no hour lost at a boundary, none paid twice.
   */
  it('splits a boundary-crossing shift across two cycles, summing to the whole', async () => {
    // Fri 24 Jul 20:00 → Sat 25 Jul 03:00. Boundary at the 25th.
    await addShift(server, employee.token, {
      startTime: '2026-07-24T20:00:00.000Z',
      endTime: '2026-07-25T03:00:00.000Z',
    });

    const june = await payrollFor('2026-06');
    const july = await payrollFor('2026-07');

    // Friday evening is the +33% zone, not the weekend.
    expect(zone(june, 'EVENING').hours).toBe(4);
    expect(zone(june, 'EVENING').rate).toBe(EVENING_RATE);
    expect(zone(june, 'EVENING').pay).toBe(13034);
    expect(june.totalHours).toBe(4);

    // Saturday small hours are weekend, all day.
    expect(zone(july, 'WEEKEND').hours).toBe(3);
    expect(zone(july, 'WEEKEND').rate).toBe(WEEKEND_RATE);
    expect(july.totalHours).toBe(3);

    expect(june.totalHours + july.totalHours).toBe(7);
  });

  /**
   * ⭐ A shift is cut at every zone boundary it crosses, on top of the cycle
   * clipping. A row is a **date**, so this appears as two rows.
   */
  it('splits a shift across a zone boundary at midnight', async () => {
    // Tue 4 Aug 22:00 → Wed 5 Aug 06:00.
    await addShift(server, employee.token, {
      startTime: '2026-08-04T22:00:00.000Z',
      endTime: '2026-08-05T06:00:00.000Z',
    });

    const body = await payrollFor('2026-07');

    expect(zone(body, 'EVENING').hours).toBe(2);
    expect(zone(body, 'EVENING').pay).toBe(2 * EVENING_RATE);
    expect(zone(body, 'NIGHT').hours).toBe(6);
    expect(zone(body, 'NIGHT').pay).toBe(6 * NIGHT_RATE);
    expect(body.totalHours).toBe(8);

    expect(body.days).toHaveLength(2);
    expect(body.days[0]).toMatchObject({
      date: '2026-08-04',
      totalHours: 2,
    });
    expect(body.days[0].hours.EVENING).toBe(2);
    expect(body.days[1]).toMatchObject({
      date: '2026-08-05',
      totalHours: 6,
    });
    expect(body.days[1].hours.NIGHT).toBe(6);
  });

  it('every column adds up to the figure beneath it', async () => {
    await addShift(server, employee.token, {
      startTime: '2026-08-03T08:00:00.000Z',
      endTime: '2026-08-03T20:15:00.000Z',
    });
    await addShift(server, employee.token, {
      startTime: '2026-08-04T22:00:00.000Z',
      endTime: '2026-08-05T06:00:00.000Z',
    });
    await addShift(server, employee.token, {
      startTime: '2026-08-01T10:00:00.000Z',
      endTime: '2026-08-01T18:30:00.000Z',
    });

    const body = await payrollFor('2026-07');

    // ⚠️ Load-bearing, not decoration. Every assertion below compares one sum
    // against another, and `0 === 0` satisfies all of them — so a payroll that
    // silently returned nothing would pass this test, which is named as the
    // integrity check for exactly those sums. These four lines are what stop it
    // from being vacuous.
    expect(body.totalHours).toBeGreaterThan(0);
    expect(body.totalPay).toBeGreaterThan(0);
    expect(body.days.length).toBeGreaterThan(1);
    expect(body.zones.filter((z) => z.hours > 0).length).toBeGreaterThan(1);

    const zonePaySum = body.zones.reduce((sum, z) => sum + z.pay, 0);
    expect(zonePaySum).toBe(body.totalPay);

    const zoneHoursSum = body.zones.reduce((sum, z) => sum + z.hours, 0);
    expect(zoneHoursSum).toBeCloseTo(body.totalHours, 10);

    const dayHoursSum = body.days.reduce((sum, d) => sum + d.totalHours, 0);
    expect(dayHoursSum).toBeCloseTo(body.totalHours, 10);

    // Every zone line is reproducible by hand: hours x rate, rounded, is pay.
    for (const z of body.zones) {
      expect(z.pay).toBe(Math.round(z.hours * z.rate));
    }

    // Always four zones, even the empty ones — the client renders a list.
    expect(body.zones.map((z) => z.zone)).toEqual([
      'DAY',
      'EVENING',
      'NIGHT',
      'WEEKEND',
    ]);
  });

  it('returns the identical shape to the admin and the employee', async () => {
    await addShift(server, employee.token, {
      startTime: '2026-08-03T08:00:00.000Z',
      endTime: '2026-08-03T16:00:00.000Z',
    });

    const own = await payrollFor('2026-07');
    const asAdmin = await request(server)
      .get(`/payroll/${employee.id}?cycle=2026-07`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(asAdmin.body).toEqual(own);
  });

  it('scopes hasOpenShift to the cycle the shift started in', async () => {
    await request(server)
      .post('/time-entries/clock-in')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(201);

    // "now" is inside the 2026-07 cycle.
    expect((await payrollFor('2026-07')).hasOpenShift).toBe(true);
    expect((await payrollFor('2026-06')).hasOpenShift).toBe(false);
    // An open shift is unpayable, so it adds nothing.
    expect((await payrollFor('2026-07')).totalPay).toBe(0);
  });

  it('404s on any id that is not an EMPLOYEE, the admin’s own included', async () => {
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: 'ADMIN' },
    });

    await request(server)
      .get(`/payroll/${admin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    await request(server)
      .get('/payroll/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('enforces the role split on every payroll route', async () => {
    await request(server).get('/payroll/me').expect(401);

    await request(server)
      .get('/payroll/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await request(server)
      .get('/payroll/overview')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(403);

    await request(server)
      .get(`/payroll/${employee.id}`)
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(403);
  });

  describe('the team overview', () => {
    it('lists the right people and totals the cost exactly', async () => {
      // Active, no hours — must still appear, at zero.
      const idle = await createActivatedEmployee(server, adminToken, {
        hourlyRate: 3000,
      });

      // Deactivated, but worked this cycle — someone who left mid-cycle still
      // has to be paid, and still has to show up in the costs.
      const leaver = await createActivatedEmployee(server, adminToken, {
        hourlyRate: RATE,
      });
      await addShift(server, leaver.token, {
        startTime: '2026-08-03T08:00:00.000Z',
        endTime: '2026-08-03T16:00:00.000Z',
      });
      await request(server)
        .delete(`/users/${leaver.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Deactivated with nothing in this cycle — must NOT appear.
      const ghost = await createActivatedEmployee(server, adminToken);
      await request(server)
        .delete(`/users/${ghost.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await addShift(server, employee.token, {
        startTime: '2026-08-04T09:00:00.000Z',
        endTime: '2026-08-04T17:00:00.000Z',
      });

      const response = await request(server)
        .get('/payroll/overview?cycle=2026-07')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = response.body as PayrollOverviewBody;

      const ids = body.rows.map((r) => r.userId);
      expect(ids).toContain(employee.id);
      expect(ids).toContain(idle.id);
      expect(ids).toContain(leaver.id);
      expect(ids).not.toContain(ghost.id);

      expect(body.rows.find((r) => r.userId === idle.id)).toMatchObject({
        totalHours: 0,
        totalPay: 0,
      });

      const rowSum = body.rows.reduce((sum, r) => sum + r.totalPay, 0);
      expect(rowSum).toBe(body.totalCost);
    });

    it('agrees exactly with that employee’s own page', async () => {
      await addShift(server, employee.token, {
        startTime: '2026-08-04T22:00:00.000Z',
        endTime: '2026-08-05T06:00:00.000Z',
      });

      const own = await payrollFor('2026-07');
      const response = await request(server)
        .get('/payroll/overview?cycle=2026-07')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const row = (response.body as PayrollOverviewBody).rows.find(
        (r) => r.userId === employee.id,
      );
      expect(row).toMatchObject({
        totalHours: own.totalHours,
        totalPay: own.totalPay,
      });
    });
  });

  it('rejects a malformed cycle key with 400', async () => {
    await request(server)
      .get('/payroll/me?cycle=not-a-cycle')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(400);
  });
});
