import { Role } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

/** The defaults the seed writes, restored after any test that changes them. */
const DEFAULT_CYCLE_START_DAY = 25;
const DEFAULT_CYCLE_END_DAY = 24;

/**
 * Returns the database to the state the seed leaves it in: one ADMIN, no
 * employees, no time entries, cycle 25/24.
 *
 * Two deliberate choices:
 *
 * - **The seeded admin survives.** Deleting every `User` would force each test
 *   to recreate an admin and log in again, and would push the admin's id off 1
 *   — which several assertions depend on (`GET /payroll/1` → 404 because the
 *   admin is not an employee). The admin is a fixture, not test data.
 * - **`AppSettings` is reset rather than deleted.** The row is a singleton
 *   pinned by a `CHECK ("id" = 1)` constraint, and `SettingsService` answers a
 *   missing row with a loud 500. Tests that exercise `PUT /settings` move the
 *   cycle boundary, and leaving it moved would silently change which cycle
 *   every later payroll test resolves to.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  // Time entries and rate rows first — both hold an FK to User, and the delete
  // below is RESTRICT, so leaving either behind fails the whole reset rather
  // than cascading. Every employee has at least one rate row (POST /users
  // writes it), so this is never a no-op.
  await prisma.timeEntry.deleteMany();
  await prisma.userRate.deleteMany();
  await prisma.user.deleteMany({ where: { role: Role.EMPLOYEE } });
  await prisma.appSettings.update({
    where: { id: 1 },
    data: {
      cycleStartDay: DEFAULT_CYCLE_START_DAY,
      cycleEndDay: DEFAULT_CYCLE_END_DAY,
    },
  });
}
