import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { isSplitAcrossCycle, type CycleRange } from '../settings/cycle.util';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { CycleEntriesResponseDto } from './dto/cycle-entries-response.dto';
import { OpenShiftResponseDto } from './dto/open-shift-response.dto';
import {
  CycleTimeEntryDto,
  TimeEntryResponseDto,
} from './dto/time-entry-response.dto';
import { Prisma, Role, type TimeEntry } from '../generated/prisma/client';

/** Reused verbatim from spec §8a — same situation, same required action. */
const OPEN_SHIFT_EXISTS =
  'You already have an open shift. Please clock out first.';

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Two layers guard "at most one open shift", and neither is redundant: the
   * check below answers the ordinary case without depending on driver error
   * codes, while the partial unique index behind the catch closes the window
   * between reading and writing — a double-tap on the Clock In button is the
   * most ordinary gesture there is, and two open shifts would leave the second
   * one un-closable by clock-out and its owner blocked from every write.
   * Same pattern as findByEmail() + P2002 in createEmployee().
   */
  async clockIn(userId: number): Promise<TimeEntryResponseDto> {
    if (await this.findOpenShiftRow(userId)) {
      throw new BadRequestException(OPEN_SHIFT_EXISTS);
    }

    try {
      // No overlap check here, and none is needed: the manual path refuses any
      // timestamp in the future (spec §7a rule 4), so no closed shift can ever
      // reach `now`, and a shift starting at `now` cannot land inside one.
      const entry = await this.prisma.timeEntry.create({
        data: { userId, startTime: new Date(), endTime: null },
      });
      return this.toResponseDto(entry);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Deliberately the same message the check gives: which layer stopped
        // the request is our business, not the caller's.
        throw new BadRequestException(OPEN_SHIFT_EXISTS);
      }
      throw error;
    }
  }

  async clockOut(userId: number): Promise<TimeEntryResponseDto> {
    const open = await this.findOpenShiftRow(userId);
    if (!open) {
      throw new BadRequestException('No open shift to clock out of.');
    }

    // Nothing to check against either: while this shift was open the employee
    // could write nothing at all, so closing it cannot swallow another shift.
    const entry = await this.prisma.timeEntry.update({
      where: { id: open.id },
      data: { endTime: new Date() },
    });
    return this.toResponseDto(entry);
  }

  async findOpen(userId: number): Promise<OpenShiftResponseDto> {
    const open = await this.findOpenShiftRow(userId);
    return { openShift: open ? this.toResponseDto(open) : null };
  }

  async create(
    caller: { userId: number; role: Role },
    dto: CreateTimeEntryDto,
  ): Promise<TimeEntryResponseDto> {
    const userId = await this.resolveTargetUserId(caller, dto.userId);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    await this.assertOwnerHasNoOpenShift(userId, caller.role);
    await this.assertNoOverlap(userId, startTime, endTime);

    const entry = await this.prisma.timeEntry.create({
      data: { userId, startTime, endTime, notes: dto.notes ?? null },
    });
    return this.toResponseDto(entry);
  }

  async update(
    caller: { userId: number; role: Role },
    id: number,
    dto: UpdateTimeEntryDto,
  ): Promise<TimeEntryResponseDto> {
    const existing = await this.findOwnedOrThrow(caller, id);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    // Always the row's owner, never the caller: an admin's own state is empty
    // and would let every check pass for the wrong reason.
    await this.assertOwnerHasNoOpenShift(existing.userId, caller.role);
    await this.assertNoOverlap(existing.userId, startTime, endTime, id);

    const entry = await this.prisma.timeEntry.update({
      where: { id },
      data: { startTime, endTime, notes: dto.notes ?? null },
    });
    return this.toResponseDto(entry);
  }

  async remove(
    caller: { userId: number; role: Role },
    id: number,
  ): Promise<void> {
    await this.findOwnedOrThrow(caller, id);
    // No open-shift block and no overlap check: removing a row can create
    // neither a second open shift nor a collision.
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  /**
   * The employee's own history (`GET /time-entries/me`) and, via the wrapper
   * below, an admin's view of one employee — deliberately the same shape and
   * the same query, because both feed the same ShiftList + CycleNavigator.
   */
  async findCycleEntries(
    userId: number,
    cycle?: string,
  ): Promise<CycleEntriesResponseDto> {
    const { range, cycleDto } =
      await this.settingsService.resolveCycleRange(cycle);

    // NOT the payroll query. Payroll takes closed shifts overlapping the cycle;
    // this must additionally show OPEN ones, which `endTime: { not: null }`
    // would silently drop — and the approved ShiftList renders a red "Open"
    // badge for exactly those. An open shift has no end to overlap with, so it
    // is matched on startTime instead.
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId,
        OR: [
          {
            endTime: { not: null, gt: range.start },
            startTime: { lt: range.endExclusive },
          },
          {
            endTime: null,
            startTime: { gte: range.start, lt: range.endExclusive },
          },
        ],
      },
      orderBy: { startTime: 'desc' },
    });

    return {
      ...cycleDto,
      entries: entries.map((entry) => this.toCycleEntryDto(entry, range)),
    };
  }

  /** Admin route: an unknown or non-employee id is a 404, not an empty list. */
  async findCycleEntriesForEmployee(
    employeeId: number,
    cycle?: string,
  ): Promise<CycleEntriesResponseDto> {
    await this.usersService.assertEmployeeExists(employeeId);
    return this.findCycleEntries(employeeId, cycle);
  }

  /**
   * Who the new shift belongs to. An ADMIN must say (they have no shifts of
   * their own, and the admin route of ShiftList is where the button lives); an
   * EMPLOYEE may not, since they always write to themselves.
   */
  private async resolveTargetUserId(
    caller: { userId: number; role: Role },
    requestedUserId: number | undefined,
  ): Promise<number> {
    if (caller.role !== Role.ADMIN) {
      // Rejected even when it matches their own id: "the field is not yours to
      // send" is one rule, while "…unless it happens to equal your own" is a
      // second one that has to be re-derived every time someone reads this.
      if (requestedUserId !== undefined) {
        throw new BadRequestException('userId can only be set by an admin.');
      }
      return caller.userId;
    }

    if (requestedUserId === undefined) {
      throw new BadRequestException(
        'userId is required when an admin creates a shift.',
      );
    }
    await this.usersService.assertEmployeeExists(requestedUserId);
    return requestedUserId;
  }

  /**
   * Owner-or-ADMIN, folded into the `where` rather than checked separately:
   * someone else's row and a row that does not exist produce the same 404, so
   * the caller learns nothing about rows that are not theirs and there is no
   * ownership branch to forget on one route out of three.
   */
  private async findOwnedOrThrow(
    caller: { userId: number; role: Role },
    id: number,
  ): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id,
        ...(caller.role === Role.ADMIN ? {} : { userId: caller.userId }),
      },
    });
    if (!entry) {
      throw new NotFoundException(`Time entry with id ${id} not found.`);
    }
    return entry;
  }

  /**
   * The asymmetric half of the write rules (spec §7a). While the owner has an
   * open shift an EMPLOYEE may write nothing — not even to the open row — and
   * clocking out is how they unblock. That is what makes an overlap created by
   * clock-out impossible by construction rather than checked for.
   *
   * An ADMIN is exempt: clock-out is EMPLOYEE-only and closes the caller's own
   * shift, so PUT is the only tool that exists for someone else's open shift.
   * Without this exemption a deactivated employee's open shift could never be
   * closed by anyone, and the admin would be locked out of an employee's whole
   * history for as long as that employee happened to be on shift.
   */
  private async assertOwnerHasNoOpenShift(
    userId: number,
    callerRole: Role,
  ): Promise<void> {
    if (callerRole === Role.ADMIN) return;
    if (await this.findOpenShiftRow(userId)) {
      throw new BadRequestException(OPEN_SHIFT_EXISTS);
    }
  }

  /**
   * No two shifts of one person may occupy the same time (spec §7a rule 3) —
   * two entries 08:00-16:00 and 12:00-20:00 would pay 16 hours for 12 worked.
   *
   * `gt`/`lt` against the new interval, never `gte`/`lte`: shifts that merely
   * touch (one ends exactly when the next begins) do not overlap, and getting
   * this wrong would reject a perfectly normal back-to-back pair.
   *
   * An open shift occupies [startTime, ∞) — it has no end to compare, and
   * treating it as a point would let an admin write inside a shift that is
   * still running.
   *
   * `excludeId` is the row being edited: without it every update collides with
   * its own unedited self.
   */
  private async assertNoOverlap(
    userId: number,
    startTime: Date,
    endTime: Date,
    excludeId?: number,
  ): Promise<void> {
    const conflict = await this.prisma.timeEntry.findFirst({
      where: {
        userId,
        ...(excludeId !== undefined && { id: { not: excludeId } }),
        OR: [
          { endTime: { not: null, gt: startTime }, startTime: { lt: endTime } },
          { endTime: null, startTime: { lt: endTime } },
        ],
      },
    });
    if (conflict) {
      throw new BadRequestException('This shift overlaps an existing shift.');
    }
  }

  private async findOpenShiftRow(userId: number): Promise<TimeEntry | null> {
    return this.prisma.timeEntry.findFirst({
      where: { userId, endTime: null },
    });
  }

  private toResponseDto(entry: TimeEntry): TimeEntryResponseDto {
    return {
      id: entry.id,
      userId: entry.userId,
      startTime: entry.startTime.toISOString(),
      endTime: entry.endTime ? entry.endTime.toISOString() : null,
      notes: entry.notes,
    };
  }

  private toCycleEntryDto(
    entry: TimeEntry,
    range: CycleRange,
  ): CycleTimeEntryDto {
    return {
      ...this.toResponseDto(entry),
      isSplit: isSplitAcrossCycle(entry.startTime, entry.endTime, range),
    };
  }
}
