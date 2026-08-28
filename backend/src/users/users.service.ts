import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ErrorCode } from '../common/error-codes';
import { conflict, notFound } from '../common/domain-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { Prisma, Role, type User } from '../generated/prisma/client';

const SETUP_CODE_VALIDITY_DAYS = 3;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
   * have no business being loaded into memory that often.
   */
  async findActiveById(id: number): Promise<{ id: number; role: Role } | null> {
    return this.prisma.user.findFirst({
      where: { id, isActive: true },
      select: { id: true, role: true },
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
   * Used by PayrollService for a single employee's breakdown: the name that
   * goes on the page and the rate the hours are multiplied by, and nothing
   * else. Another narrow, purpose-named reader with an explicit `select` —
   * `User` has one owner (see Invariants), so other services ask through here,
   * but what comes back is scoped to the question and can never carry
   * password/setupCode into a wage calculation.
   *
   * Deactivated employees resolve normally: someone who left mid-cycle still
   * worked those hours and still has to appear on the payroll for it.
   *
   * ADMIN ids resolve to null — an admin has no hourlyRate and never clocks in,
   * so `GET /payroll/:userId` on one is a 404, not an empty payslip.
   */
  async findEmployeeRate(
    id: number,
  ): Promise<{ id: number; name: string; hourlyRate: number | null } | null> {
    return this.prisma.user.findFirst({
      where: { id, role: Role.EMPLOYEE },
      select: { id: true, name: true, hourlyRate: true },
    });
  }

  /**
   * The same question for the whole team, in one query — used by the admin
   * payroll overview. Deliberately a batch reader rather than findEmployeeRate()
   * in a loop: fifteen employees would otherwise be fifteen round trips to the
   * database on a page that should cost one.
   *
   * Returns every employee, active or not, with `isActive` so the caller can
   * apply its own rule about who belongs on the page for a given cycle.
   */
  async findAllEmployeeRates(): Promise<
    { id: number; name: string; hourlyRate: number | null; isActive: boolean }[]
  > {
    return this.prisma.user.findMany({
      where: { role: Role.EMPLOYEE },
      select: { id: true, name: true, hourlyRate: true, isActive: true },
      orderBy: { name: 'asc' },
    });
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

  async updateEmployee(
    id: number,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    await this.findEmployeeByIdOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
      },
    });
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
