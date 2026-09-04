import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `env('DATABASE_URL')` throws while this config *loads*, which breaks
// `prisma generate` on a clean clone that has no .env yet — generate needs the
// config to be loadable, not a reachable database (prisma#28590). That matters
// because src/generated/ is gitignored, so `npm install` (postinstall → generate)
// is what makes a fresh checkout compile at all.
//
// The placeholder is deliberately unusable: every command that really talks to
// Postgres is given a real DATABASE_URL, and one that isn't should fail loudly.
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
