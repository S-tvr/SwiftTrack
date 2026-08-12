import { config } from 'dotenv';
import { resolve } from 'node:path';

const ENV_TEST_PATH = resolve(__dirname, '..', '..', '.env.test');

/**
 * Loads `backend/.env.test` into `process.env`.
 *
 * `override: true` matters because this may run after something else has
 * already populated a key. What it does NOT do is protect us from the reverse
 * case, which is the dangerous one: `AppModule` calls
 * `ConfigModule.forRoot()`, which loads the development `backend/.env`. That
 * happens when the test file imports `AppModule` — i.e. after this function.
 * dotenv never overwrites a key already present in `process.env`, so the values
 * loaded here win. The ordering is the whole safety mechanism, which is why
 * this is wired as jest `setupFiles` (before the test module graph is loaded)
 * rather than `setupFilesAfterEnv`.
 */
export function loadTestEnv(): void {
  const result = config({ path: ENV_TEST_PATH, override: true });

  if (result.error) {
    throw new Error(
      `Could not read ${ENV_TEST_PATH}. Copy backend/.env.test.example to backend/.env.test before running the e2e suite.`,
    );
  }
}

/**
 * Refuses to run against anything but a database whose name ends in `_test`.
 *
 * The suite truncates tables between tests. If the ordering described above
 * ever breaks — a renamed file, a reordered jest config, a future `override`
 * on `ConfigModule` — the failure mode without this guard is silent and
 * expensive: the run points at the development database and wipes it, and
 * every test still passes, so nothing signals what happened. This turns that
 * into a loud stop before the first query.
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. The e2e suite loads it from backend/.env.test.',
    );
  }

  // Compare the path segment only: a password or host could contain "_test"
  // and would otherwise satisfy a naive `endsWith` on the whole URL.
  const databaseName = new URL(url).pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run the e2e suite against database "${databaseName}": the name must end in _test. ` +
        'This suite truncates tables between tests. Check backend/.env.test.',
    );
  }
}
