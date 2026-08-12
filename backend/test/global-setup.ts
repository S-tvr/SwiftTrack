import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

import { assertTestDatabase, loadTestEnv } from './helpers/env';

const BACKEND_ROOT = resolve(__dirname, '..');

/**
 * Runs once, in its own process, before any test file.
 *
 * This is not just setup — it is the only place in the project that verifies
 * two things at all (build-plan §8b, point 4): that the migrations apply to an
 * **empty** database, and that the seed script runs. Neither can be proved
 * against the development database, which has had both applied since step 1.
 * A failure here is a real finding, not a broken harness.
 */
export default function globalSetup(): void {
  // globalSetup runs in a separate process from setup-e2e.ts, so the env has to
  // be loaded again here rather than inherited.
  loadTestEnv();
  assertTestDatabase();

  // `migrate deploy` rather than `migrate dev`: it applies existing migrations
  // and never generates a new one or prompts, which is what a non-interactive
  // run needs. Prisma 7 does not chain these, so the seed is invoked explicitly
  // (see architecture.md § Prisma Client Pattern).
  run('npx prisma migrate deploy');
  run('npx prisma db seed');
}

function run(command: string): void {
  execSync(command, {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}
