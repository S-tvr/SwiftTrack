import request from 'supertest';
import type { App } from 'supertest/types';

import type { LoginBody, TimeEntryBody, UserBody } from './types';

export interface ActivatedEmployee {
  id: number;
  name: string;
  email: string;
  hourlyRate: number;
  password: string;
  token: string;
}

let emailCounter = 0;

/**
 * A fresh address per call. `resetDatabase` clears employees between tests, but
 * a shared literal would still collide inside a single test that creates two
 * people — and the failure would surface as a 409 on the *second* fixture,
 * pointing at the wrong thing.
 */
export function uniqueEmail(prefix = 'employee'): string {
  emailCounter += 1;
  return `${prefix}.${emailCounter}@e2e.local`;
}

export async function login(
  server: App,
  email: string,
  password: string,
): Promise<string> {
  const response = await request(server)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return (response.body as LoginBody).accessToken;
}

export async function loginAsAdmin(server: App): Promise<string> {
  return login(
    server,
    process.env.ADMIN_EMAIL as string,
    process.env.ADMIN_PASSWORD as string,
  );
}

/** Creates an employee but does **not** activate them — they stay "Pending". */
export async function createPendingEmployee(
  server: App,
  adminToken: string,
  overrides: Partial<{ name: string; email: string; hourlyRate: number }> = {},
): Promise<UserBody> {
  const response = await request(server)
    .post('/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: overrides.name ?? 'Test Employee',
      email: overrides.email ?? uniqueEmail(),
      hourlyRate: overrides.hourlyRate ?? 2450,
    })
    .expect(201);
  return response.body as UserBody;
}

/**
 * The full onboarding path of spec §5: created by the admin, activated with the
 * setup code, then logged in. Done over HTTP rather than by inserting rows, so
 * every fixture also re-exercises the flow the whole product depends on.
 */
export async function createActivatedEmployee(
  server: App,
  adminToken: string,
  overrides: Partial<{ name: string; email: string; hourlyRate: number }> = {},
): Promise<ActivatedEmployee> {
  const created = await createPendingEmployee(server, adminToken, overrides);
  const password = 'employee-password';

  await request(server)
    .post('/auth/set-initial-password')
    .send({
      email: created.email,
      setupCode: created.setupCode,
      newPassword: password,
    })
    .expect(200);

  const token = await login(server, created.email, password);

  return {
    id: created.id,
    name: created.name,
    email: created.email,
    hourlyRate: created.hourlyRate as number,
    password,
    token,
  };
}

/** Manually adds a closed shift (`POST /time-entries`). */
export async function addShift(
  server: App,
  token: string,
  body: {
    userId?: number;
    startTime: string;
    endTime: string;
    notes?: string;
  },
): Promise<TimeEntryBody> {
  const response = await request(server)
    .post('/time-entries')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(201);
  return response.body as TimeEntryBody;
}
