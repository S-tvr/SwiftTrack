-- Narrow the allowed pay-cycle start day from 11-25 to 20-25.
--
-- A business rule, not a technical one: a real pay cycle starts at the end of
-- the month, and days 11-19 were theoretical flexibility nobody used. The
-- property the original range was chosen for is unchanged — every day in 20-25
-- exists in every month, February included, so resolving a cycle still needs no
-- day-of-month clamping and consecutive cycles stay contiguous.
--
-- ⚠️ This migration MOVES DATA, which no other migration in this project does.
-- An installation already storing 11-19 would otherwise be stranded: the row
-- keeps working (SettingsService reads whatever is there), but every PUT
-- /settings is refused by the new DTO bounds, so the admin is locked out of the
-- one screen that could repair it. Moving it to 25 — the schema default, and
-- the value a fresh install already has — is what keeps that from happening.
--
-- ⚠️ **This re-cuts every cycle boundary**, and that is the reason it is stated
-- here rather than done quietly. Payroll is recomputed from raw shifts on every
-- request and never frozen, so changing this day changes which hours belong to
-- which cycle, including cycles already paid. The same warning the admin sees
-- in ChangeCycleDialog applies to this statement, with nobody to confirm it.
-- On an installation already at 20-25 it is a no-op and changes nothing.
UPDATE "AppSettings"
SET "cycleStartDay" = 25,
    "cycleEndDay" = 24
WHERE "cycleStartDay" < 20;

-- Enforce the range below the application, the same way AppSettings already
-- constrains its own id. The DTO refuses a bad value at the door and this
-- refuses one written directly to the database — layers, not duplicates, and
-- the reason SettingsService's assertUsableCycleStartDay() can now only be
-- reached by a row that predates this constraint.
--
-- cycleEndDay is constrained through its relationship to cycleStartDay rather
-- than by its own bounds: it is derived (always cycleStartDay - 1), and stating
-- the derivation is what makes an inconsistent pair unrepresentable instead of
-- merely unlikely.
ALTER TABLE "AppSettings"
  ADD CONSTRAINT "AppSettings_cycleStartDay_range"
  CHECK ("cycleStartDay" BETWEEN 20 AND 25);

ALTER TABLE "AppSettings"
  ADD CONSTRAINT "AppSettings_cycleEndDay_derived"
  CHECK ("cycleEndDay" = "cycleStartDay" - 1);
