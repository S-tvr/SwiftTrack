-- Enforce that AppSettings only ever has a single row (id = 1).
-- Not expressible in schema.prisma (no native CHECK constraint support),
-- so it's hand-written here. See architecture.md § Database Schema.
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_id_check" CHECK ("id" = 1);
