-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('SHIFT_CREATED', 'SHIFT_UPDATED', 'SHIFT_DELETED', 'EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'EMPLOYEE_DEACTIVATED', 'EMPLOYEE_REACTIVATED', 'SETUP_CODE_REISSUED', 'PASSWORD_RESET_BY_ADMIN', 'PASSWORD_CHANGED', 'ACCOUNT_ACTIVATED', 'RATE_QUEUED', 'SETTINGS_UPDATED');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" INTEGER,
    "subjectId" INTEGER,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_subjectId_createdAt_idx" ON "AuditLog"("subjectId", "createdAt");

-- Enforce "append-only" at the database level.
--
-- This is the whole claim of an audit log: a trail that can be quietly edited
-- after the fact answers nothing that the rows themselves did not already
-- answer. The application never issues an UPDATE or DELETE against this table,
-- but a rule enforced only by "no code does that today" is not enforced — it is
-- a convention waiting for the next writer. Same reasoning as the AppSettings
-- CHECK ("id" = 1) and the partial unique index on TimeEntry: the constraint
-- belongs below the layer that must not violate it.
--
-- ⚠️ A trigger, NOT `REVOKE UPDATE, DELETE ... FROM PUBLIC`. This was measured
-- against the running database rather than assumed, and the obvious version
-- does nothing here: this app connects as `swifttrack`, which both OWNS the
-- table and is a SUPERUSER. Table privileges are not consulted for a superuser,
-- and an owner's rights are not removed by revoking from PUBLIC — the UPDATE
-- succeeded with the REVOKE in place. Row-level security fails for the same
-- reason (superusers bypass it, and an owner needs FORCE). A BEFORE trigger is
-- consulted for every writer including the owner and a superuser, which is what
-- makes it the mechanism that actually holds.
--
-- ⚠️ **TRUNCATE is deliberately NOT blocked**, and the boundary is exact rather
-- than accidental: a row-level trigger is not consulted by TRUNCATE (measured —
-- it empties the table with this trigger in place). What the trigger therefore
-- guarantees is that no individual row can be **altered or removed**, which is
-- the property an audit trail actually rests on. TRUNCATE is all-or-nothing and
-- leaves an empty table — conspicuous rather than quiet, and the opposite of the
-- tampering this guards against.
--
-- The escape hatch is load-bearing in two places: `test/helpers/db.ts` resets
-- this table between e2e tests, and a genuine retention policy (dropping rows
-- older than N years) has a door that does not require dropping the trigger.
-- Adding a `BEFORE TRUNCATE ... FOR EACH STATEMENT` trigger would close both,
-- and was considered and declined.
CREATE OR REPLACE FUNCTION "AuditLog_append_only"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "AuditLog_append_only"();
