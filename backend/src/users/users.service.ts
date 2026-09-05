import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ErrorCode } from '../common/error-codes';
import { conflict, notFound } from '../common/domain-errors';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { Prisma, Role, type User } from '../generated/prisma/client';

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

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAllEmployees(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => this.toResponseDto(user));
  }

  async findMe(userId: number): Promise<UserProfileDto> {
    const user = await this.findUserByIdOrThrow(userId);
    return this.toProfileDto(user);
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
   */
  async findEmployeeRateAt(
    id: number,
    at: Date,
  ): Promise<{ id: number; name: string; hourlyRate: number | null } | null> {
    const employee = await this.prisma.user.findFirst({
      where: { id, role: Role.EMPLOYEE },
      select: { id: true, name: true },
    });
    if (!employee) return null;

    const rate = await this.prisma.userRate.findFirst({
      where: { userId: id, effectiveFrom: { lte: at } },
      orderBy: { effectiveFrom: 'desc' },
      select: { hourlyRate: true },
    });

    return { ...employee, hourlyRate: rate?.hourlyRate ?? null };
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

  async createEmployee(dto: CreateUserDto): Promise<UserResponseDto> {
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
      const user = await this.prisma.user.create({
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
      return this.toResponseDto(user);
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
    id: number,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const employee = await this.findEmployeeByIdOrThrow(id);

    const rateChanged =
      dto.hourlyRate !== undefined && dto.hourlyRate !== employee.hourlyRate;

    const updateUser = this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
      },
    });

    if (!rateChanged) return this.toResponseDto(await updateUser);

    const hourlyRate = dto.hourlyRate as number;
    const effectiveFrom = await this.settingsService.resolveRateEffectiveFrom();

    const [user] = await this.prisma.$transaction([
      updateUser,
      this.prisma.userRate.upsert({
        where: { userId_effectiveFrom: { userId: id, effectiveFrom } },
        update: { hourlyRate },
        create: { userId: id, hourlyRate, effectiveFrom },
      }),
    ]);
    return this.toResponseDto(user);
  }

  async deactivate(id: number): Promise<UserResponseDto> {
    await this.findEmployeeByIdOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toResponseDto(user);
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
  async reactivate(id: number): Promise<UserResponseDto> {
    await this.findEmployeeByIdOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
    return this.toResponseDto(user);
  }

  /**
   * A fresh code and a fresh 3-day window for an employee who never activated
   * in time. This closes a guaranteed dead end rather than an edge case: the
   * code is issued exactly once, in `createEmployee`, and had no regeneration
   * path — so someone hired on a Friday who sat down on Tuesday was locked out
   * permanently, while the expiry message told them to "contact your admin",
   * who had no tool.
   */
  async resetSetupCode(id: number): Promise<UserResponseDto> {
    const employee = await this.findEmployeeByIdOrThrow(id);

    if (employee.password !== null) {
      throw conflict(
        ErrorCode.ACCOUNT_ALREADY_ACTIVATED,
        'This account has already been activated.',
      );
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        setupCode: this.generateSetupCode(),
        setupCodeExpiresAt: this.addDays(new Date(), SETUP_CODE_VALIDITY_DAYS),
      },
    });
    return this.toResponseDto(user);
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
  async resetPassword(id: number): Promise<UserResponseDto> {
    await this.findEmployeeByIdOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        password: null,
        setupCode: this.generateSetupCode(),
        setupCodeExpiresAt: this.addDays(new Date(), SETUP_CODE_VALIDITY_DAYS),
        tokenVersion: { increment: 1 },
      },
    });
    return this.toResponseDto(user);
  }

  async activateAccount(email: string, hashedPassword: string): Promise<User> {
    return this.prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        setupCode: null,
        setupCodeExpiresAt: null,
      },
    });
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
    const updated = await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword, tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
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

  /** The user's own view of themselves — never carries setupCode. */
  toProfileDto(user: User): UserProfileDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hourlyRate: user.hourlyRate,
    };
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hourlyRate: user.hourlyRate,
      isActive: user.isActive,
      hasActivated: user.password !== null,
      setupCode: user.setupCode,
      setupCodeExpiresAt: user.setupCodeExpiresAt
        ? user.setupCodeExpiresAt.toISOString()
        : null,
    };
  }
}
