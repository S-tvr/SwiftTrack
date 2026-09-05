import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  computeCycleRange,
  resolveCurrentCycleKey,
  shiftCycleKey,
} from '../src/settings/cycle.util';

/**
 * Demo data for local development — NOT part of `prisma db seed`.
 *
 * Kept separate on purpose. `prisma/seed.ts` is the minimum an installation
 * needs to function (the first admin, the AppSettings singleton) and it runs in
 * production deploys *and* in the e2e `globalSetup`. Fake employees in there
 * would ship to production and would break the test suite, which asserts
 * exactly who exists.
 *
 * This is also **not a migration**: migrations change the schema and run
 * everywhere. This only writes rows, only when you ask it to.
 *
 * Run with: npm run seed:demo
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_PASSWORD = 'demo1234';
const HOUR = 60 * 60 * 1000;
/** Mirrors `UsersService`'s RATE_EPOCH — see the comment there for why. */
const RATE_EPOCH = new Date(0);

/** Mirrors the e2e guard, pointing the other way: never touch the test database. */
function assertNotTestDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to seed demo data into "${databaseName}". The e2e suite owns that database and truncates it between tests, so anything written here would vanish and would break assertions about who exists. Point DATABASE_URL at the development database.`,
    );
  }
}

interface DemoPerson {
  name: string;
  email: string;
  hourlyRate: number;
  /** Which days of the week they work, and the hours, in UTC. */
  pattern: Array<{ weekday: number; startHour: number; lengthHours: number }>;
  /**
   * The two special cases are flags on the person rather than lookups after the
   * fact. An earlier version picked them positionally out of the created rows
   * (`const [anna, , elin] = …`), which quietly tied "who has the open shift"
   * to the order of this array — reorder it and the wrong person gets it, with
   * nothing to notice.
   */
  boundaryShifts?: boolean;
  openShift?: boolean;
}

// Mon=1 … Sun=0, matching Date#getUTCDay().
const PEOPLE: DemoPerson[] = [
  {
    // The ordinary case: office hours, entirely in the DAY zone.
    name: 'Anna Jónsdóttir',
    email: 'anna@demo.local',
    hourlyRate: 2450,
    pattern: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startHour: 8,
      lengthHours: 8,
    })),
    boundaryShifts: true,
  },
  {
    // Exists so all four zones have hours. Without someone like this the
    // Night and Weekend columns are permanently zero and the breakdown looks
    // broken rather than empty.
    name: 'Björn Ólafsson',
    email: 'bjorn@demo.local',
    hourlyRate: 2800,
    pattern: [
      { weekday: 1, startHour: 14, lengthHours: 8 }, // 3h DAY + 5h EVENING
      { weekday: 2, startHour: 22, lengthHours: 8 }, // 2h EVENING + 6h NIGHT
      // Wednesday is off — the Tuesday night shift runs into it.
      { weekday: 4, startHour: 14, lengthHours: 8 },
      { weekday: 6, startHour: 10, lengthHours: 8 }, // WEEKEND
      { weekday: 0, startHour: 10, lengthHours: 8 }, // WEEKEND
    ],
  },
  {
    // Part-time, and the one who is clocked in right now.
    name: 'Elín Sigurðardóttir',
    email: 'elin@demo.local',
    hourlyRate: 2100,
    pattern: [1, 3, 5].map((weekday) => ({
      weekday,
      startHour: 9,
      lengthHours: 5,
    })),
    openShift: true,
  },
];

/** Worked this cycle, then left — must still appear on the overview and be paid. */
const LEAVER: DemoPerson = {
  name: 'Kristján Þórsson',
  email: 'kristjan@demo.local',
  hourlyRate: 2600,
  pattern: [2, 4].map((weekday) => ({
    weekday,
    startHour: 8,
    lengthHours: 7,
  })),
};

/** Created but never activated — the "Pending" badge and a visible setupCode. */
const PENDING = {
  name: 'Sigríður Magnúsdóttir',
  email: 'sigridur@demo.local',
  hourlyRate: 3000,
};

interface ShiftSeed {
  userId: number;
  startTime: Date;
  endTime: Date | null;
  notes?: string | null;
}

const NOTES = [
  'Covered for a colleague',
  'Stock delivery',
  'Late close',
  'Training',
];

/**
 * Every shift this produces obeys the §7a write rules — nothing in the future,
 * no overlaps, at most one open shift per person. The script writes through
 * Prisma and so bypasses the DTO validation entirely; producing data the API
 * itself would reject would mean the first attempt to edit a shift in the UI
 * fails with a 400 for no visible reason.
 */
function buildShifts(
  userId: number,
  person: DemoPerson,
  cycles: Array<{ start: Date; endExclusive: Date }>,
  now: Date,
  startOfToday: Date,
): ShiftSeed[] {
  const shifts: ShiftSeed[] = [];
  let noteIndex = 0;

  for (const cycle of cycles) {
    for (
      let day = new Date(cycle.start);
      day < cycle.endExclusive;
      day = new Date(day.getTime() + 24 * HOUR)
    ) {
      // Regular shifts stop at yesterday; today belongs to the open shift.
      if (day >= startOfToday) continue;

      const slot = person.pattern.find((p) => p.weekday === day.getUTCDay());
      if (!slot) continue;

      const startTime = new Date(day.getTime() + slot.startHour * HOUR);
      const endTime = new Date(startTime.getTime() + slot.lengthHours * HOUR);
      if (endTime > now) continue;

      noteIndex += 1;
      shifts.push({
        userId,
        startTime,
        endTime,
        // Only some shifts carry notes, so the column shows both states.
        notes: noteIndex % 3 === 0 ? NOTES[noteIndex % NOTES.length] : null,
      });
    }
  }

  return shifts;
}

/**
 * Set only by the Docker entrypoint, which runs this script on every container
 * start. This script deletes every EMPLOYEE row before rebuilding, so unguarded
 * it would erase anything created since the last restart. Unset when the script
 * is run by hand, where "rebuild the demo roster" is exactly what was asked for.
 */
async function shouldSkipBecauseNotEmpty(): Promise<boolean> {
  if (process.env.SEED_DEMO_ONLY_IF_EMPTY !== 'true') return false;

  const existing = await prisma.user.count({ where: { role: 'EMPLOYEE' } });
  if (existing === 0) return false;

  console.log(
    `${existing} employee(s) already present — skipping demo seed to preserve existing data.`,
  );
  return true;
}

async function main(): Promise<void> {
  assertNotTestDatabase();

  if (await shouldSkipBecauseNotEmpty()) return;

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new Error(
      'Settings not initialised. Run `npx prisma db seed` first — it creates the first admin and the AppSettings row this script builds on.',
    );
  }

  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // Three cycles so the ◀▶ navigator has somewhere to go: with two, it is a
  // single click and you cannot tell it is navigation.
  const currentKey = resolveCurrentCycleKey(now, settings.cycleStartDay);
  const cycleKeys = [
    shiftCycleKey(currentKey, -2),
    shiftCycleKey(currentKey, -1),
    currentKey,
  ];
  const cycles = cycleKeys.map((key) =>
    computeCycleRange(key, settings.cycleStartDay),
  );

  // Idempotent by rebuild: the admin survives, everything else is recreated, so
  // two runs leave exactly the same database as one.
  //
  // ⚠️ Time entries must go first. `TimeEntry.user` is declared without
  // `onDelete: Cascade`, so Prisma restricts: deleting an employee who has
  // entries fails with a foreign-key violation. The first run of this script
  // passed only because the database happened to be empty.
  const removedEntries = await prisma.timeEntry.deleteMany({
    // Scoped rather than a bare deleteMany(): an admin has no entries today,
    // but this script has no business deciding that for rows it did not write.
    where: { user: { role: 'EMPLOYEE' } },
  });
  // Rate rows are restricted the same way time entries are, and every employee
  // has at least one — so this is not optional cleanup, it is what lets the
  // delete below succeed at all.
  await prisma.userRate.deleteMany({ where: { user: { role: 'EMPLOYEE' } } });
  const removed = await prisma.user.deleteMany({ where: { role: 'EMPLOYEE' } });
  console.log(
    `Removed ${removed.count} existing employee(s) and ${removedEntries.count} time entries.`,
  );

  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  const allShifts: ShiftSeed[] = [];

  for (const person of PEOPLE) {
    const user = await prisma.user.create({
      data: {
        name: person.name,
        email: person.email,
        hourlyRate: person.hourlyRate,
        role: 'EMPLOYEE',
        password,
        // Payroll prices a cycle from UserRate, not from the column above, so
        // an employee seeded without one 500s on their own payroll page. At the
        // epoch for the same reason POST /users uses it: these demo people have
        // shifts in cycles going back months.
        rates: {
          create: { hourlyRate: person.hourlyRate, effectiveFrom: RATE_EPOCH },
        },
      },
    });
    allShifts.push(...buildShifts(user.id, person, cycles, now, startOfToday));

    // A shift straddling each cycle boundary: the hours before midnight on the
    // 24th belong to one cycle, the hours after to the next, and the row shows
    // up in both flagged `isSplit`. Derived from the boundary rather than
    // hardcoded, so it stays correct if cycleStartDay changes.
    if (person.boundaryShifts) {
      for (const cycle of cycles.slice(1)) {
        const startTime = new Date(cycle.start.getTime() - 4 * HOUR);
        const endTime = new Date(cycle.start.getTime() + 3 * HOUR);
        if (endTime > now) continue;
        allShifts.push({
          userId: user.id,
          startTime,
          endTime,
          notes: 'Crosses the cycle boundary',
        });
      }
    }

    // Started earlier today, never clocked out. Gives the Clock page a
    // "Clock Out" state and the payroll pages a hasOpenShift warning.
    if (person.openShift) {
      allShifts.push({
        userId: user.id,
        startTime: new Date(now.getTime() - 3 * HOUR),
        endTime: null,
        notes: null,
      });
    }
  }

  // Someone who left mid-cycle: still owed money, so still on the overview.
  const leaver = await prisma.user.create({
    data: {
      name: LEAVER.name,
      email: LEAVER.email,
      hourlyRate: LEAVER.hourlyRate,
      role: 'EMPLOYEE',
      password,
      isActive: false,
      rates: {
        create: { hourlyRate: LEAVER.hourlyRate, effectiveFrom: RATE_EPOCH },
      },
    },
  });
  allShifts.push(
    ...buildShifts(leaver.id, LEAVER, cycles.slice(-1), now, startOfToday),
  );

  await prisma.user.create({
    data: {
      name: PENDING.name,
      email: PENDING.email,
      hourlyRate: PENDING.hourlyRate,
      role: 'EMPLOYEE',
      password: null,
      setupCode: String(randomInt(1000, 10000)),
      setupCodeExpiresAt: new Date(now.getTime() + 3 * 24 * HOUR),
      rates: {
        create: { hourlyRate: PENDING.hourlyRate, effectiveFrom: RATE_EPOCH },
      },
    },
  });

  await prisma.timeEntry.createMany({ data: allShifts });

  const pending = await prisma.user.findUniqueOrThrow({
    where: { email: PENDING.email },
  });

  console.log(
    `\nSeeded ${allShifts.length} time entries across cycles ${cycleKeys.join(', ')}.`,
  );
  console.log(
    '\nDemo logins (password for all activated employees: ' +
      DEMO_PASSWORD +
      ')',
  );
  for (const person of PEOPLE) console.log(`  ${person.email}`);
  console.log(
    `  ${LEAVER.email}  (deactivated — cannot log in, appears in payroll)`,
  );
  console.log(
    `  ${PENDING.email}  (pending — activate with setup code ${pending.setupCode})`,
  );
  console.log('\nThe admin account is untouched.');
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
