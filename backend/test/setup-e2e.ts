import { assertTestDatabase, loadTestEnv } from './helpers/env';

// Runs as jest `setupFiles`, i.e. once per test file, before that file's module
// graph (and therefore before AppModule / ConfigModule) is loaded. See the
// comment on loadTestEnv() for why this ordering is the safety mechanism.
loadTestEnv();
assertTestDatabase();
