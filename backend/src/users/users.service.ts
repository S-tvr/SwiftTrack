import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ErrorCode } from '../common/error-codes';
import { conflict, notFound } from '../common/domain-errors';
import { AuditService } from '../audit/audit.service';
import {
  toEmployeeSnapshot,
  toRateSnapshot,
  type AuditEntry,
} from '../audit/audit-entry.types';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import {
  AuditAction,
  Prisma,
  Role,
  type User,
} from '../generated/prisma/client';

const SETUP_CODE_VALIDITY_DAYS = 3;

/**
 * Where an employee's first rate starts applying: the beginning of time, not
 * the cycle they were hired in.
 *
 * An admin may write a shift at any past date (spec §7a rule 5), so a cycle
 * earlier than the employee's own row is reachable — and a cycle with no rate in
 * force makes `PayrollService.requireHourlyRate()` throw, which on the team
 * overview takes down the page for *everyone*. Anchoring at the epoch makes
 * "no rate in force" unreachable for anybody who has ever had one, so that 500
 * keeps meaning what it was written to mean: somebody edited the database by
 * hand. Costs nothing — a new hire has no shifts in cycles before they existed.
 */
const RATE_EPOCH = new Date(0);

/**
 * Where one employee's rate stands at a single instant: what they are paid
 * **now**, and the raise queued behind it if there is one.
 *
 * ⚠️ The two travel together deliberately. They are read from one query at one
 * instant (`findRatesNow`), and every response that shows a rate shows both —
 * so passing them as one value is what stops a caller pairing a fresh rate with
 * a stale announcement.
 */
interface RatesNow {
  /** The rate in force at the time of reading. `null` only for an employee with
   *  no rate row at all, which the epoch row above makes unreachable in
   *  practice. */
  current: number | null;
  /** The next rate and the instant it starts applying, or `null` when nothing
   *  is queued — the ordinary case. */
  pending: { hourlyRate: number; effectiveFrom: Date } | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  async findAllEmployees(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      orderBy: { name: 'asc' },
    });
    // Two queries for the whole team, never one per person — the same shape as
    // `findAllEmployeeRatesAt`. Without the batch, rendering the Team list would
    // issue one rate lookup per row.
    const rates = await this.findRatesNow(users.map((user) => user.id));
    return users.map((user) => this.toResponseDto(user, rates.get(user.id)));
  }

  /**
   * Both halves of "where is this employee's rate right now", keyed by id: the
   * rate **in force** and the one **queued** behind it.
   *
   * ⚠️ **Both, from one query, because the answer is one question.** The rate on
   * screen and the raise announced under it are read at the same instant and
   * must agree; splitting them across two `findMany`s with two `new Date()`s
   * would let a cycle boundary fall between them and print a rate alongside a
   * "changes to" line that has already happened. It is also what keeps
   * `findAllEmployees` at two queries for the whole team.
   *
   * The cost is fetching an employee's whole rate history rather than just the
   * future rows — the same trade `findEmployeeRateAt` already makes, on a table
   * the schema calls a few dozen rows. Splitting this back into two filtered
   * queries to "save" bytes would cost a round trip and reintroduce the skew.
   *
   * ⚠️ Pending is **relative to now**, not to a cycle. The Team list is not a
   * cycle-aware screen, so "queued" can only mean "not yet in effect". The
   * payroll page asks the same question against the cycle it is showing
   * (`findEmployeeRateAt`), and the two answers legitimately differ while an
   * admin is paging through old cycles.
   *
   * `updateEmployee` upserts on a single instant, so there is at most one future
   * row per employee. Ascending order makes the tie-break explicit anyway: the
   * last past row wins (the greatest `effectiveFrom <= now`, i.e. in force) and
   * the first future row wins (the one that lands next).
   */
  private async findRatesNow(
    userIds: number[],
  ): Promise<Map<number, RatesNow>> {
    const rates = new Map<number, RatesNow>();
    if (userIds.length === 0) return rates;

    const rows = await this.prisma.userRate.findMany({
      where: { userId: { in: userIds } },
      orderBy: { effectiveFrom: 'asc' },
      select: { userId: true, hourlyRate: true, effectiveFrom: true },
    });

    // ⚠️ Read once, before the loop. Consulting the clock per row would let a
    // boundary crossed mid-iteration classify two rows against two different
    // "now"s — the same discipline `resolveCycleRange` states for its own reads.
    const now = new Date();

    for (const row of rows) {
      const entry = rates.get(row.userId) ?? { current: null, pending: null };
      if (row.effectiveFrom <= now) {
        entry.current = row.hourlyRate;
      } else if (entry.pending === null) {
        entry.pending = {
          hourlyRate: row.hourlyRate,
          effectiveFrom: row.effectiveFrom,
        };
      }
      rates.set(row.userId, entry);
    }
    return rates;
  }

  /** The single-employee counterpart, for the write paths and the profile. */
  private async findRateNow(userId: number): Promise<RatesNow | undefined> {
    return (await this.findRatesNow([userId])).get(userId);
  }

  async findMe(userId: number): Promise<UserProfileDto> {
    const user = await this.findUserByIdOrThrow(userId);
    return this.toProfileFor(user);
  }

  /**
   * The async half of `toProfileDto`: resolves the rate in force, then maps.
   *
   * Exists so that `findMe` and `AuthService.login` — the two places a profile
   * is built — cannot drift, and so the ADMIN short-circuit below is written
   * once. `AuthService` never touches `UserRate` itself; only this service owns
   * `User` and its rate history.
   */
  async toProfileFor(user: User): Promise<UserProfileDto> {
    // An admin has no rate and never gets a `UserRate` row, so the query would
    // be guaranteed empty. Skipping it keeps `/users/me` and the login response
    // at one query for the account that signs in most.
    if (user.role !== Role.EMPLOYEE) return this.toProfileDto(user, null);

    const rates = await this.findRateNow(user.id);
    return this.toProfileDto(user, rates?.current ?? null);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Used by JwtStrategy on every authenticated request: resolves the id in the
   * token to a user who is still active, or null if they were deactivated (or
   * deleted) since the token was issued.
   *
   * `select` is deliberate — this runs on every request, and password/setupCode
   * have no business being loaded into memory that often. `tokenVersion` earns
   * its place there (step 8f): the strategy compares it against the token, and
   * reading it here is what makes revocation cost no extra query.
   */
  async findActiveById(
    id: number,
  ): Promise<{ id: number; role: Role; tokenVersion: number } | null> {
    return this.prisma.user.findFirst({
      where: { id, isActive: true },
      select: { id: true, role: true, tokenVersion: true },
    });
  }

  /**
   * Used by TimeEntriesService before an admin writes hours to someone: it
   * needs to know an EMPLOYEE with this id exists, and nothing else. `User` has
   * one owner (see Invariants), so other services ask through here rather than
   * querying prisma.user — but what they get back is scoped to the question,
   * with an explicit `select`, so password/setupCode cannot ride along.
   *
   * Deactivated employees pass on purpose: an admin must still be able to
   * repair the history of someone who has left, and their open shift is only
   * closable through PUT since they can no longer log in to clock out.
   *
   * ADMIN ids resolve to 404 for the same reason update/deactivate refuse
   * them — an admin has no hourlyRate and never clocks in, so a shift written
   * to their account would never surface and never be paid.
   */
  async assertEmployeeExists(id: number): Promise<void> {
    const employee = await this.prisma.user.findFirst({
      where: { id, role: Role.EMPLOYEE },
      select: { id: true },
    });
    if (!employee) {
      throw notFound(
        ErrorCode.EMPLOYEE_NOT_FOUND,
        `Employee with id ${id} not found.`,
      );
    }
  }

  /**
   * Used by TimeEntriesService for the shift list: *whose* list it is. The
   * admin's `/shifts/:userId` and `/payroll/:userId` are twin pages for the same
   * third person, and payroll has carried `userId`/`name` since step 6 — without
   * this the shift list would need a second call to `GET /users` to print one
   * label, downloading the whole team and every pending `setupCode` with it.
   *
   * It throws rather than returning null, which is what lets it *replace*
   * `assertEmployeeExists()` on the admin route instead of running beside it:
   * "does this employee exist" and "what are they called" are one question here,
   * and therefore one query. Same code and same message, so the 404 that route
   * already answered is unchanged.
   *
   * Deactivated employees pass, exactly as in `assertEmployeeExists()` — there
   * is deliberately no `isActive` filter here. An admin must still be able to
   * read and repair the history of someone who has left, including the open
   * shift they can no longer log in to close.
   */
  async findEmployeeNameOrThrow(
    id: number,
  ): Promise<{ id: number; name: string }> {
    const employee = await this.prisma.user.findFirst({
      where: { id, role: Role.EMPLOYEE },
      select: { id: true, name: true },
    });
    if (!employee) {
      throw notFound(
        ErrorCode.EMPLOYEE_NOT_FOUND,
        `Employee with id ${id} not found.`,
      );
    }
    return employee;
  }

  /**
   * Used by PayrollService for a single employee's breakdown: the name that
   * goes on the page and the rate the hours are multiplied by, and nothing
   * else. Another narrow, purpose-named reader with an explicit `select` —
   * `User` has one owner (see Invariants), so other services ask through here,
   * but what comes back is scoped to the question and can never carry
   * password/setupCode into a wage calculation.
   *
   * ⚠️ **The rate is the one in force at `at`, not the current one.** `at` is
   * always the cycle's `start`, so a raise entered later leaves an already-priced
   * cycle exactly as it was — that is the whole point of `UserRate`, and reading
   * `User.hourlyRate` here instead would silently reprice every past cycle.
   * The caller passes the instant: this service owns `User`, not cycle
   * boundaries, and never resolves a cycle for itself.
   *
   * Deactivated employees resolve normally: someone who left mid-cycle still
   * worked those hours and still has to appear on the payroll for it.
   *
   * ADMIN ids resolve to null — an admin has no rate and never clocks in, so
   * `GET /payroll/:userId` on one is a 404, not an empty payslip.
   *
   * A `null` `hourlyRate` (an employee with no rate row in force) is left for
   * the caller to reject loudly, exactly as before.
   *
   * `pending` is the rate that takes effect the instant this cycle ends — the
   * raise the viewer has *not yet* been paid at — or null. It costs no extra
   * round trip: both rows come from one `findMany`. The payroll page needs it
   * because a raise leaves the cycle being viewed untouched, and an unexplained
   * gap between the rate shown here and the one on the Team list reads as an
   * underpayment (see `NOTICES.pendingRate` on the client).
   *
   * ⚠️ **Only a rate landing exactly at `until` counts**, not every future one.
   * It used to be every row with `effectiveFrom > at`, which meant paging back
   * to June announced a raise that took effect in September: three cycles in a
   * row carried the same "changes to X from Y" line, in the future tense, on
   * cycles that were closed and already paid. The notice exists to explain the
   * gap between "what I am paid now" and "what this cycle was priced at" — a
   * closed cycle two raises ago has no such gap, so it must say nothing.
   *
   * Relative to the **cycle**, not to now: the cycle immediately before a raise
   * announces it whether or not it has since taken effect, and the cycle that
   * already carries the new rate reports nothing.
   */
  async findEmployeeRateAt(
    id: number,
    at: Date,
    until: Date,
  ): Promise<{
    id: number;
    name: string;
    hourlyRate: number | null;
    pending: { hourlyRate: number; effectiveFrom: Date } | null;
  } | null> {
    const employee = await this.prisma.user.findFirst({
      where: { id, role: Role.EMPLOYEE },
      select: { id: true, name: true },
    });
    if (!employee) return null;

    // One query for both halves. Ordered descending and sliced at the instant:
    // everything at or before `at` is history (the first of them is the rate in
    // force), everything after is the future (the last of them is the next one
    // to take effect).
    const rates = await this.prisma.userRate.findMany({
      where: { userId: id },
      orderBy: { effectiveFrom: 'desc' },
      select: { hourlyRate: true, effectiveFrom: true },
    });

    const inForce = rates.find((rate) => rate.effectiveFrom <= at) ?? null;
    // Exactly at the boundary, not merely after it. `effectiveFrom` is always a
    // cycle-start instant (schema.prisma) and `until` is this cycle's
    // endExclusive — the same instant the next cycle opens — so equality is the
    // precise question "does the rate change the moment this cycle closes?".
    const next =
      rates.find((rate) => rate.effectiveFrom.getTime() === until.getTime()) ??
      null;

    return {
      ...employee,
      hourlyRate: inForce?.hourlyRate ?? null,
      pending: next,
    };
  }

  /**
   * The same question for the whole team — used by the admin payroll overview.
   * Deliberately a batch reader rather than `findEmployeeRateAt()` in a loop:
   * fifteen employees would otherwise be thirty round trips to the database on a
   * page that should cost one.
   *
   * **Two queries regardless of headcount.** Every rate row at or before `at` is
   * fetched in one go and folded in memory, ascending, so the last write per
   * user is by construction the greatest `effectiveFrom <= at` — the one in
   * force. Deliberately not `DISTINCT ON`, which would mean `$queryRaw`: that
   * would be the first raw SQL in this codebase and would lose the explicit
   * `select` this file applies everywhere else, to save nothing on a table whose
   * entire history is a few dozen rows. The same "one batched query, group in
   * memory" shape `PayrollService` already uses for shifts.
   *
   * Returns every employee, active or not, with `isActive` so the caller can
   * apply its own rule about who belongs on the page for a given cycle.
   */
  async findAllEmployeeRatesAt(
    at: Date,
  ): Promise<
    { id: number; name: string; hourlyRate: number | null; isActive: boolean }[]
  > {
    const employees = await this.prisma.user.findMany({
      where: { role: Role.EMPLOYEE },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    if (employees.length === 0) return [];

    const rates = await this.prisma.userRate.findMany({
      where: {
        userId: { in: employees.map((employee) => employee.id) },
        effectiveFrom: { lte: at },
      },
      select: { userId: true, hourlyRate: true },
      orderBy: { effectiveFrom: 'asc' },
    });

    const rateByUser = new Map<number, number>();
    for (const rate of rates) rateByUser.set(rate.userId, rate.hourlyRate);

    return employees.map((employee) => ({
      ...employee,
      hourlyRate: rateByUser.get(employee.id) ?? null,
    }));
  }

  async createEmployee(
    actorId: number,
    dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw conflict(
        ErrorCode.EMAIL_ALREADY_EXISTS,
        'A user with this email already exists.',
      );
    }

    try {
      // The rate is written twice on purpose, in one statement: `hourlyRate` is
      // what this employee is paid *now* (read by /users, /users/me and login),
      // and the UserRate row is what payroll prices a cycle with. A nested
      // create keeps them from ever existing apart — an employee with a rate on
      // their row but no rate row would 500 on their own payroll page.
      // See RATE_EPOCH above for why the first one starts at the epoch.
      // ⚠️ The callback form, where the nested create alone would have done:
      // the audit row needs the new `id`, which does not exist until the insert
      // returns, so it cannot be a third statement in an array. The nested
      // write is already atomic on its own — this widens that atomicity to
      // cover the audit row too, rather than adding it where there was none.
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            hourlyRate: dto.hourlyRate,
            role: 'EMPLOYEE',
            password: null,
            setupCode: this.generateSetupCode(),
            setupCodeExpiresAt: this.addDays(
              new Date(),
              SETUP_CODE_VALIDITY_DAYS,
            ),
            rates: {
              create: {
                hourlyRate: dto.hourlyRate,
                effectiveFrom: RATE_EPOCH,
              },
            },
          },
        });
        await this.auditService.record(tx, {
          action: AuditAction.EMPLOYEE_CREATED,
          actorId,
          subjectId: created.id,
          entityType: 'User',
          entityId: created.id,
          before: null,
          // ⚠️ The snapshot, never the row: `created` carries the fresh
          // `setupCode`, which is the secret unlocking this account and must
          // never reach the audit table. `toEmployeeSnapshot` cannot copy it —
          // it does not accept it.
          after: toEmployeeSnapshot(created),
        });
        return created;
      });
      // Both halves are known by construction, so this path needs no rate read
      // at all: the only row this employee has is the epoch one written above,
      // which is in force immediately and can never be pending.
      return this.toResponseDto(user, {
        current: dto.hourlyRate,
        pending: null,
      });
    } catch (error) {
      // The check above handles the common case with a clean message, but two
      // concurrent creates (e.g. a double-clicked submit) can both pass it and
      // race to the insert. The DB unique index on email is the real guarantee —
      // translate its violation into the same 409 instead of leaking a 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Same code as the explicit check above: which of the two layers caught
        // it is our business, not the caller's.
        throw conflict(
          ErrorCode.EMAIL_ALREADY_EXISTS,
          'A user with this email already exists.',
        );
      }
      throw error;
    }
  }

  /**
   * ⚠️ **A changed rate takes effect from the start of the next cycle, never
   * immediately** (spec §4, decision 5g). Payroll prices a cycle with the rate
   * in force at that cycle's start, so writing the new rate at "now" would
   * reprice the cycle currently in progress — and before `UserRate` existed, it
   * repriced every cycle the employee had ever worked, which is the bug this
   * path was rewritten to fix.
   *
   * Three cases, and the third is not an optimisation: `EmployeeForm` always
   * submits both fields, so a rename would otherwise write a rate row on every
   * save.
   *
   * The write is an **upsert** on `(userId, effectiveFrom)`, so two raises
   * inside the same cycle collapse into one row for the next one rather than
   * colliding with the unique constraint. A useful consequence: a typo stays
   * correctable right up until the cycle it applies to begins.
   *
   * Both writes go in one `$transaction` — `User.hourlyRate` is the
   * denormalised head of this history, and a reader that saw one without the
   * other would report a rate nobody is paid. Same reasoning as
   * `updatePasswordAndRevokeTokens()` putting the hash and the token bump in a
   * single UPDATE.
   */
  async updateEmployee(
    actorId: number,
    id: number,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const employee = await this.findEmployeeByIdOrThrow(id);

    // ⚠️ Compared against `employee.hourlyRate` — the newest rate **entered**,
    // not the one in force. This is the one place the denormalised column still
    // does real work, and the comparison is deliberately not "has the rate they
    // are paid changed": with 3,200 already queued, an admin re-submitting the
    // form unchanged sends 3,200, which against the in-force 2,450 would read as
    // a change and upsert the identical row on every save. Against the head it
    // correctly reads as no change.
    const rateChanged =
      dto.hourlyRate !== undefined && dto.hourlyRate !== employee.hourlyRate;

    // ⚠️ The same question as `rateChanged`, asked about the other field, and it
    // lives here beside it rather than inline at one of the two write branches —
    // which is exactly the bug the step 18 review caught. `EmployeeForm` submits
    // **both** fields on every save, so an admin opening a row and pressing Save
    // without editing sends an identical name and rate. The write below is still
    // issued (the API's answer must not change), but there is nothing to record:
    // an audit row whose `before` and `after` are identical describes an event
    // that did not happen, and a trail carrying those makes every other row less
    // believable. Same rule as `reactivate`'s no-op guard — the state decides,
    // never the request.
    const nameChanged = dto.name !== undefined && dto.name !== employee.name;

    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
    };

    // ⚠️ Still reports a pending rate. This branch means *this* request changed
    // nothing about the rate — not that nothing is queued. A rename must not
    // wipe the "→ 3,800 from 25 Sep" line off the row it just re-rendered.
    if (!rateChanged) {
      // ⚠️ This branch wrote outside any transaction before step 18, since a
      // lone UPDATE needs none. It takes one **only when there is an audit row
      // to pair with the write** — the two must land together or not at all.
      // When nothing changed there is nothing to record, so the transaction has
      // no work to do either and the write goes out on its own, exactly as it
      // did before step 18. The shape says which case this is.
      const [user, rates] = await Promise.all([
        nameChanged
          ? this.prisma.$transaction(async (tx) => {
              const updated = await tx.user.update({ where: { id }, data });
              await this.auditService.record(tx, {
                action: AuditAction.EMPLOYEE_UPDATED,
                actorId,
                subjectId: id,
                entityType: 'User',
                entityId: id,
                before: toEmployeeSnapshot(employee),
                after: toEmployeeSnapshot(updated),
              });
              return updated;
            })
          : this.prisma.user.update({ where: { id }, data }),
        this.findRateNow(id),
      ]);
      return this.toResponseDto(user, rates);
    }

    const hourlyRate = dto.hourlyRate as number;
    // ⚠️ The in-force rate is read **before** the write, and that is safe rather
    // than racy: the upsert only ever touches a row whose `effectiveFrom` is the
    // next cycle's start, so it cannot change which row is in force *now*.
    // Moving this read after the transaction would buy nothing and cost a round
    // trip it currently shares with `resolveRateEffectiveFrom`.
    //
    // It cannot be derived from `employee` instead: on a **second** raise inside
    // the same cycle the head already holds the first raise's figure, while the
    // rate in force is still the older one.
    const [effectiveFrom, rates] = await Promise.all([
      this.settingsService.resolveRateEffectiveFrom(),
      this.findRateNow(id),
    ]);

    // ⚠️ Read **before** the upsert, and this is the single most valuable row
    // in the audit table. The upsert's key is `(userId, effectiveFrom)`, so a
    // second raise entered in the same cycle **overwrites** the first and
    // leaves nothing behind: without this read, the figure that was previously
    // queued is gone from the system entirely. It is `null` on an ordinary
    // first raise, which is the common case.
    const supersededRate = await this.prisma.userRate.findUnique({
      where: { userId_effectiveFrom: { userId: id, effectiveFrom } },
      select: { hourlyRate: true, effectiveFrom: true },
    });

    // ⚠️ The callback form, converted from the array form in step 18. An array
    // cannot express "insert a row naming what the upsert just replaced" —
    // those promises are built before any of them runs. The atomicity the array
    // form was chosen for is unchanged; only the shape is.
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data });
      await tx.userRate.upsert({
        where: { userId_effectiveFrom: { userId: id, effectiveFrom } },
        update: { hourlyRate },
        create: { userId: id, hourlyRate, effectiveFrom },
      });

      // ⚠️ Two rows, not one, and the pair is the point. A single request can
      // both rename an employee and change their pay; recording one event would
      // leave a reader unable to tell which of the two this request did. They
      // are also read by different people asking different questions.
      const entries: AuditEntry[] = [];
      if (nameChanged) {
        entries.push({
          action: AuditAction.EMPLOYEE_UPDATED,
          actorId,
          subjectId: id,
          entityType: 'User',
          entityId: id,
          before: toEmployeeSnapshot(employee),
          after: toEmployeeSnapshot(updated),
        });
      }
      entries.push({
        action: AuditAction.RATE_QUEUED,
        actorId,
        subjectId: id,
        entityType: 'UserRate',
        // The upsert returns the row, but its id is of no use to a reader: the
        // rate is identified by whose it is and when it starts.
        entityId: null,
        before: supersededRate ? toRateSnapshot(supersededRate) : null,
        after: toRateSnapshot({ hourlyRate, effectiveFrom }),
      });
      await this.auditService.recordAll(tx, entries);
      return updated;
    });
    // The row just written is the pending one, by construction — reported from
    // the write rather than from `rates`, which was read before it and would
    // still hold whatever was queued previously.
    return this.toResponseDto(user, {
      current: rates?.current ?? null,
      pending: { hourlyRate, effectiveFrom },
    });
  }

  /**
   * One `User` write and the audit row describing it, in one transaction.
   *
   * Four methods here — deactivate, reactivate, resetSetupCode, resetPassword —
   * are the same shape: resolve the row, write one column set, record what
   * changed. Written out four times, the transaction is four chances to forget
   * one; written once, the audit row is not something a new sibling has to
   * remember, because there is no way to call this without producing one.
   *
   * The entry is built from the **written** row rather than passed in, so
   * `after` always describes what actually landed.
   */
  private writeAndAudit(
    write: (tx: Prisma.TransactionClient) => Promise<User>,
    entry: (written: User) => AuditEntry,
  ): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const written = await write(tx);
      await this.auditService.record(tx, entry(written));
      return written;
    });
  }

  async deactivate(actorId: number, id: number): Promise<UserResponseDto> {
    const employee = await this.findEmployeeByIdOrThrow(id);

    const [user, rates] = await Promise.all([
      this.writeAndAudit(
        (tx) => tx.user.update({ where: { id }, data: { isActive: false } }),
        (updated) => ({
          action: AuditAction.EMPLOYEE_DEACTIVATED,
          actorId,
          subjectId: id,
          entityType: 'User',
          entityId: id,
          before: toEmployeeSnapshot(employee),
          after: toEmployeeSnapshot(updated),
        }),
      ),
      // Deactivating does not cancel a queued raise — the row stays, and so
      // does the line on the list. Reported for the same reason as everywhere
      // else: this response replaces the row on screen.
      this.findRateNow(id),
    ]);
    return this.toResponseDto(user, rates);
  }

  /**
   * The counterpart to `deactivate()`. Without it deactivation is irreversible
   * through the API — `updateEmployee` accepts only name/hourlyRate, and a fresh
   * `createEmployee` collides with the unique email — so the only remedy for a
   * seasonal employee coming back was editing the database by hand.
   *
   * Already-active rows return 200 rather than 409: the button that calls this
   * only renders on a deactivated row, so the only way to reach that state is a
   * double submit, where "they are active" is the outcome the admin asked for.
   * Contrast `resetSetupCode()`, which refuses — there the repeat is not a no-op
   * but a new secret written to an account that no longer needs one.
   */
  async reactivate(actorId: number, id: number): Promise<UserResponseDto> {
    const employee = await this.findEmployeeByIdOrThrow(id);

    // ⚠️ **No audit row when the employee was already active.** The 200-on-a
    // -repeat behaviour documented above means this write is reachable as a
    // no-op — a double submit — and it still issues an UPDATE. Recording it
    // would put an event in the table that did not happen, and a trail that
    // reports reactivations nobody performed is worse than a sparse one: it
    // makes every other row less believable. The state is what decides, not
    // the request.
    const wasInactive = !employee.isActive;

    const [user, rates] = await Promise.all([
      wasInactive
        ? this.writeAndAudit(
            (tx) => tx.user.update({ where: { id }, data: { isActive: true } }),
            (updated) => ({
              action: AuditAction.EMPLOYEE_REACTIVATED,
              actorId,
              subjectId: id,
              entityType: 'User',
              entityId: id,
              before: toEmployeeSnapshot(employee),
              after: toEmployeeSnapshot(updated),
            }),
          )
        : this.prisma.user.update({ where: { id }, data: { isActive: true } }),
      this.findRateNow(id),
    ]);
    return this.toResponseDto(user, rates);
  }

  /**
   * A fresh code and a fresh 3-day window for an employee who never activated
   * in time. This closes a guaranteed dead end rather than an edge case: the
   * code is issued exactly once, in `createEmployee`, and had no regeneration
   * path — so someone hired on a Friday who sat down on Tuesday was locked out
   * permanently, while the expiry message told them to "contact your admin",
   * who had no tool.
   */
  async resetSetupCode(actorId: number, id: number): Promise<UserResponseDto> {
    const employee = await this.findEmployeeByIdOrThrow(id);

    if (employee.password !== null) {
      throw conflict(
        ErrorCode.ACCOUNT_ALREADY_ACTIVATED,
        'This account has already been activated.',
      );
    }

    const [user, rates] = await Promise.all([
      this.writeAndAudit(
        (tx) =>
          tx.user.update({
            where: { id },
            data: {
              setupCode: this.generateSetupCode(),
              setupCodeExpiresAt: this.addDays(
                new Date(),
                SETUP_CODE_VALIDITY_DAYS,
              ),
            },
          }),
        (updated) => ({
          action: AuditAction.SETUP_CODE_REISSUED,
          actorId,
          subjectId: id,
          entityType: 'User',
          entityId: id,
          // ⚠️ before and after are **identical here, and correctly so**: the
          // snapshot carries name/hourlyRate/isActive, none of which this write
          // touches. What changed is a credential, and a credential is never a
          // value in this table — the *action* is the whole record. A reader
          // learns that a new code was issued, by whom and when, which is the
          // question; the code itself belongs only in the admin's response.
          before: toEmployeeSnapshot(employee),
          after: toEmployeeSnapshot(updated),
        }),
      ),
      this.findRateNow(id),
    ]);
    return this.toResponseDto(user, rates);
  }

  /**
   * The mirror image of `resetSetupCode()`: that one refuses once a password
   * exists· this one exists *because* one does, for an employee who forgot it
   * entirely. No guard on activation or active state — it succeeds on a
   * pending row too (the same outcome `resetSetupCode()` gives, on purpose:
   * refusing here would just point the admin at the other endpoint) and on a
   * deactivated one (also on purpose: `login`'s existing check order already
   * makes the reset inert until a separate `reactivate()` call, so this does
   * not implicitly reactivate anyone).
   *
   * Bumps `tokenVersion` in the same write, reusing step 8f's revocation
   * mechanism rather than a new one — a password reset the account holder did
   * not initiate is at least as strong a reason to kill their existing
   * sessions as a voluntary change is. Unlike `updatePasswordAndRevokeTokens`,
   * there is no replacement token to hand back: the caller is the admin, not
   * the employee, who has no session for this call to preserve.
   */
  async resetPassword(actorId: number, id: number): Promise<UserResponseDto> {
    const employee = await this.findEmployeeByIdOrThrow(id);

    const [user, rates] = await Promise.all([
      this.writeAndAudit(
        (tx) =>
          tx.user.update({
            where: { id },
            data: {
              password: null,
              setupCode: this.generateSetupCode(),
              setupCodeExpiresAt: this.addDays(
                new Date(),
                SETUP_CODE_VALIDITY_DAYS,
              ),
              tokenVersion: { increment: 1 },
            },
          }),
        (updated) => ({
          // ⚠️ **This row is the reason step 8g recorded a gap it could not
          // close.** The most privileged write in the system — one admin blanks
          // another person's password and kills every session they hold — and
          // until now nothing anywhere recorded which admin did it, to whom, or
          // when. `actorId`/`subjectId` is that record.
          action: AuditAction.PASSWORD_RESET_BY_ADMIN,
          actorId,
          subjectId: id,
          entityType: 'User',
          entityId: id,
          // As in `resetSetupCode`, the snapshots are identical by design:
          // neither the old password (a hash), the new code, nor the bumped
          // `tokenVersion` is ever a value here. The revocation is recorded as
          // an action, which is what the action name says.
          before: toEmployeeSnapshot(employee),
          after: toEmployeeSnapshot(updated),
        }),
      ),
      this.findRateNow(id),
    ]);
    return this.toResponseDto(user, rates);
  }

  async activateAccount(email: string, hashedPassword: string): Promise<User> {
    return this.writeAndAudit(
      (tx) =>
        tx.user.update({
          where: { email },
          data: {
            password: hashedPassword,
            setupCode: null,
            setupCodeExpiresAt: null,
          },
        }),
      (updated) => ({
        action: AuditAction.ACCOUNT_ACTIVATED,
        // ⚠️ The only `null` actor in the system, and it is an answer rather
        // than a missing value: this is the one mutation performed without a
        // session (`POST /auth/set-initial-password` is unauthenticated), so
        // there is no actor distinct from the subject. Recording the subject in
        // both columns would invent a fact — that somebody acted on somebody —
        // where the truth is that the account activated itself.
        actorId: null,
        subjectId: updated.id,
        entityType: 'User',
        entityId: updated.id,
        before: toEmployeeSnapshot(updated),
        after: toEmployeeSnapshot(updated),
      }),
    );
  }

  /**
   * Used by AuthService.changePassword() to verify the caller's current
   * password without loading the rest of the row. A narrow, purpose-named
   * reader with an explicit `select` — never a general `findById()`, which has
   * already leaked `password`/`setupCode` to a caller twice in this project
   * (the removed Step 2 `findById()`, the reused Step 3 response DTO).
   *
   * `role` joined the select in step 8f, for the one reason that justifies
   * widening it: changePassword now signs a replacement token, and a token
   * carries the role. Still no `setupCode`, still not a general reader.
   */
  async findCredentialsById(
    id: number,
  ): Promise<{ id: number; password: string | null; role: Role } | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, password: true, role: true },
    });
  }

  /**
   * Used by AuthService.changePassword() once the current password has been
   * verified. Deliberately separate from activateAccount(): that one also
   * clears setupCode/setupCodeExpiresAt, which do not apply here — the caller
   * is already activated, or they could not have authenticated to reach this.
   *
   * The name says both halves because it does both (step 8f): bumping
   * `tokenVersion` in the **same** UPDATE is what revokes every token issued
   * before this moment, atomically and without a second write. The new value is
   * returned so the caller can sign a replacement token without re-reading the
   * row — including the one for the caller themselves, whose own token this
   * call has just invalidated.
   */
  async updatePasswordAndRevokeTokens(
    id: number,
    hashedPassword: string,
  ): Promise<number> {
    // ⚠️ The `select` is widened from `{ tokenVersion }` to the whole row, and
    // only because the audit snapshot needs name/hourlyRate/isActive. The
    // return value is unchanged — still just the counter — so no caller learns
    // anything new, and nothing wider than the snapshot reaches the table.
    const updated = await this.writeAndAudit(
      (tx) =>
        tx.user.update({
          where: { id },
          data: { password: hashedPassword, tokenVersion: { increment: 1 } },
        }),
      (written) => ({
        // Self-service: the actor is the subject, and unlike an admin's reset
        // that identity is guaranteed by construction — `changePassword` reads
        // its `userId` from the JWT and there is no variant taking one from a
        // body. Recorded with both columns set rather than a null actor, since
        // here somebody genuinely did act: themselves.
        action: AuditAction.PASSWORD_CHANGED,
        actorId: id,
        subjectId: id,
        entityType: 'User',
        entityId: id,
        before: toEmployeeSnapshot(written),
        after: toEmployeeSnapshot(written),
      }),
    );
    return updated.tokenVersion;
  }

  /** Any user, regardless of role — used by /users/me, which serves both roles. */
  private async findUserByIdOrThrow(id: number): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw notFound(ErrorCode.USER_NOT_FOUND, `User with id ${id} not found.`);
    }
    return user;
  }

  /**
   * Employees only. Admin accounts are deliberately out of reach of the
   * update/deactivate/reactivate/reset-code routes: an admin has no hourlyRate
   * by design (spec §3), and deactivating the only admin would lock everyone
   * out of the system permanently — `reactivate()` goes through this same
   * lookup, so it is no escape hatch for an ADMIN row, and there is no public
   * register route to create a replacement.
   */
  private async findEmployeeByIdOrThrow(id: number): Promise<User> {
    const employee = await this.prisma.user.findFirst({
      where: { id, role: 'EMPLOYEE' },
    });
    if (!employee) {
      throw notFound(
        ErrorCode.EMPLOYEE_NOT_FOUND,
        `Employee with id ${id} not found.`,
      );
    }
    return employee;
  }

  private generateSetupCode(): string {
    // CSPRNG, not Math.random() — this code is the only thing gating access to
    // an unactivated account. randomInt's upper bound is exclusive.
    return randomInt(1000, 10000).toString();
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * The user's own view of themselves — never carries setupCode.
   *
   * ⚠️ `currentRate` is passed in, not read from `user.hourlyRate`. That column
   * is the newest rate **entered**, which during a queued raise is a figure
   * nobody is paid yet — and this DTO feeds the login response, so returning it
   * would show an employee a larger rate on their profile than on their own
   * payroll (spec §5g names exactly that symptom). `toProfileFor` resolves it.
   */
  toProfileDto(user: User, currentRate: number | null): UserProfileDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hourlyRate: currentRate,
    };
  }

  /**
   * ⚠️ `rates` is passed in rather than looked up here, and that is the whole
   * reason this stays a plain synchronous mapper. Both halves live in
   * `UserRate`, not on the `User` row, so querying inside would make every
   * caller pay — including `findAllEmployees`, which maps over the entire team
   * and would turn one page into one query per employee. Callers fetch it
   * (batched where they can) and hand it over.
   *
   * ⚠️ **Required, with no default.** A default would silently restore the bug
   * this parameter exists to fix — `hourlyRate` falling back to the
   * denormalised column — in any call site added later. Making it required
   * means the compiler names every one of them instead.
   */
  private toResponseDto(
    user: User,
    rates: RatesNow | undefined,
  ): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      // ⚠️ The rate **in force**, not `user.hourlyRate`. The column holds the
      // newest rate entered, which is a future promise while a raise is queued;
      // this field is documented as what the employee is paid now, and the Team
      // list prints `pendingRate` beside it to cover the difference.
      hourlyRate: rates?.current ?? null,
      isActive: user.isActive,
      hasActivated: user.password !== null,
      setupCode: user.setupCode,
      setupCodeExpiresAt: user.setupCodeExpiresAt
        ? user.setupCodeExpiresAt.toISOString()
        : null,
      // Set and cleared together, like setupCode/setupCodeExpiresAt: a rate
      // without a date says nothing useful, and a date without a rate is a
      // promise with no content.
      pendingRate: rates?.pending?.hourlyRate ?? null,
      pendingRateEffectiveFrom: rates?.pending
        ? rates.pending.effectiveFrom.toISOString()
        : null,
    };
  }
}
