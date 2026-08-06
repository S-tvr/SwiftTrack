-- Enforce "at most one open shift per user" at the database level.
--
-- The application already refuses a second clock-in, but that check is
-- check-then-act: two requests fired close together (a double-tap on the Clock
-- In button, which is the largest control on the page on mobile) can both read
-- "no open shift" before either one writes. The result breaks an invariant the
-- rest of the system relies on — clock-out closes only one of them, the other
-- stays open forever, and its owner is then permanently blocked from adding or
-- editing any shift until an admin intervenes.
--
-- A PARTIAL unique index expresses exactly the rule and nothing more: the
-- uniqueness applies only to rows where "endTime" IS NULL, so a user may still
-- have any number of closed shifts. Not expressible in schema.prisma (Prisma's
-- DSL has no WHERE clause on @@unique), so it is hand-written here — the same
-- reasoning as the AppSettings CHECK constraint. See architecture.md
-- § Invariants.
CREATE UNIQUE INDEX "TimeEntry_one_open_shift_per_user"
  ON "TimeEntry" ("userId")
  WHERE "endTime" IS NULL;
