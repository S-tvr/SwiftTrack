#!/bin/sh
# Runs on every container start, before the server. Each phase below is safe to
# repeat: migrate deploy skips applied migrations, prisma/seed.ts skips an
# existing admin and upserts AppSettings, and the demo seed is guarded (see below).
set -e

echo "→ Applying database migrations…"
npx prisma migrate deploy

echo "→ Seeding admin user and application settings…"
npx prisma db seed

if [ "${SEED_DEMO:-true}" = "true" ]; then
  echo "→ Seeding demo data…"
  # seed-demo.ts deletes every EMPLOYEE row before rebuilding, so on a restart it
  # would erase anything created since the last start. SEED_DEMO_ONLY_IF_EMPTY
  # makes it a no-op whenever employees already exist.
  SEED_DEMO_ONLY_IF_EMPTY=true npm run seed:demo
fi

echo "→ Starting SwiftTrack API…"
exec "$@"
