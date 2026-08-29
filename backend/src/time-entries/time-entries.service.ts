import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { badRequest, notFound } from '../common/domain-errors';
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

/**
 * Reused verbatim from spec §8a — same situation, same required action.
 * Suffixed to keep it distinct from `ErrorCode.OPEN_SHIFT_EXISTS`, which is the
 * identifier for the same case rather than its wording.
 */
const OPEN_SHIFT_EXISTS_MESSAGE =
  'You already have an open shift. Please clock out first.';

/** Spec §7a rule 5. Names the window, since the fix is to pick another shift. */
const CYCLE_LOCKED_MESSAGE =
  'That pay cycle is closed. You can only change shifts in your current or previous cycle.';

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
      throw badRequest(ErrorCode.OPEN_SHIFT_EXISTS, OPEN_SHIFT_EXISTS_MESSAGE);
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
        // Deliberately the same code and message the check gives: which layer
        // stopped the request is our business, not the caller's.
        throw badRequest(
          ErrorCode.OPEN_SHIFT_EXISTS,
          OPEN_SHIFT_EXISTS_MESSAGE,
        );
      }
      throw error;
    }
  }

  async clockOut(userId: number): Promise<TimeEntryResponseDto> {
    const open = await this.findOpenShiftRow(userId);
    if (!open) {
      throw badRequest(
        ErrorCode.NO_OPEN_SHIFT,
        'No open shift to clock out of.',
      );
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

    // Before the open-shift block on purpose: "you may not write here at all"
    // is a more fundamental refusal than "you may not write right now", and it
    // is the one the employee can act on by picking a different date.
    await this.assertWritableCycle(caller.role, startTime);
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

    // BOTH the row as it stands and the row as it would become. Each catches a
    // different escape: checking only the new value lets an employee drag a
    // paid June shift forward into August, and checking only the existing one
    // lets them push a current shift back into June. One check closes one door.
    await this.assertWritableCycle(caller.role, existing.startTime, startTime);

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
    const existing = await this.findOwnedOrThrow(caller, id);

    // Rule 5 covers DELETE too, unlike rules 1-4. Deleting a July shift
    // corrupts a paid cycle exactly as editing its hours down to two would;
    // locking one door and leaving the other open reads as protection.
    await this.assertWritableCycle(caller.role, existing.startTime);

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
    callerRole: Role,
    cycle?: string,
  ): Promise<CycleEntriesResponseDto> {
    // Whose list this is — the page heading, and on the admin route the
    // existence check as well, since a reader that throws answers both in one
    // query. Awaited first rather than in parallel with the settings read on
    // purpose: an id that is not an employee must keep answering 404 ahead of a
    // malformed ?cycle= answering 400, which is how the admin route behaved
    // when it asserted existence up front. Racing the two would make which
    // error wins depend on the database's mood.
    //
    // On `/me` it can never fail: RolesGuard and JwtStrategy have already
    // proved the caller is an existing, active EMPLOYEE — which is why no 404
    // is declared on that operation (see architecture.md § Invariants on
    // documenting only what a route can actually return).
    const employee = await this.usersService.findEmployeeNameOrThrow(userId);

    // One settings read for both the cycle and the write window — they derive
    // from the same `cycleStartDay`, so asking twice would risk them being
    // computed from two different ones.
    const { range, cycleDto, writableFrom, hasStarted } =
      await this.settingsService.resolveCycleRange(cycle);

    // Applied once for the whole response rather than per row. `null` means
    // "no limit applies to this caller", which is how ADMIN reads.
    const employeeWriteFloor = callerRole === Role.ADMIN ? null : writableFrom;

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
      userId: employee.id,
      name: employee.name,
      canWrite: this.canWriteInCycle(range, employeeWriteFloor, hasStarted),
      entries: entries.map((entry) =>
        this.toCycleEntryDto(entry, range, employeeWriteFloor),
      ),
    };
  }

  /**
   * Admin route: an unknown or non-employee id is a 404, not an empty list.
   *
   * Nothing is asserted here first, and that is the point — the reader inside
   * `findCycleEntries` raises exactly that 404 while resolving the name the
   * response has to carry anyway. Calling `assertEmployeeExists()` as well would
   * be a second query for a question already answered.
   */
  async findCycleEntriesForEmployee(
    employeeId: number,
    cycle?: string,
  ): Promise<CycleEntriesResponseDto> {
    // Role passed explicitly rather than inferred: this route is ADMIN-only by
    // its guard, and saying so here keeps the flags honest if that ever moves.
    return this.findCycleEntries(employeeId, Role.ADMIN, cycle);
  }

  /**
   * Whether the caller may create a shift in this cycle at all — the flag a
   * `POST` needs and that no per-entry field can carry, because a creation has
   * no row to hang one on. Without it an employee navigating ◀ to a closed
   * cycle fills in the form and meets a 400 they had no way to anticipate, and
   * the client cannot work it out alone: deciding whether a cycle is writable
   * means resolving cycle boundaries, which the frontend is forbidden to do.
   *
   * Two bounds, because the cycle can be wrong in either direction: it may be
   * closed (before the window), or it may not have started yet — rule 4 refuses
   * future timestamps, so an employee cannot write into a cycle whose first
   * instant is still ahead of us either.
   *
   * Both bounds are decided from values `SettingsService` handed over, and this
   * service reads no clock of its own: "has the cycle opened?" is a fact about
   * a cycle boundary, and every consumer of cycles is forbidden to answer those
   * for itself (see architecture.md § Invariants).
   *
   * ⚠️ Cycle-scoped only. It does not fold in the transient open-shift block:
   * that one clears the moment the employee clocks out, applies to `PUT` but
   * not `DELETE`, and already answers with its own actionable code. One boolean
   * carrying two reasons would leave the UI unable to say which is in force.
   */
  private canWriteInCycle(
    range: CycleRange,
    writableFrom: Date | null,
    hasStarted: boolean,
  ) {
    if (writableFrom === null) return true;
    return range.start.getTime() >= writableFrom.getTime() && hasStarted;
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
        throw badRequest(
          ErrorCode.USER_ID_NOT_ALLOWED,
          'userId can only be set by an admin.',
        );
      }
      return caller.userId;
    }

    if (requestedUserId === undefined) {
      throw badRequest(
        ErrorCode.USER_ID_REQUIRED,
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
      throw notFound(
        ErrorCode.TIME_ENTRY_NOT_FOUND,
        `Time entry with id ${id} not found.`,
      );
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
      throw badRequest(ErrorCode.OPEN_SHIFT_EXISTS, OPEN_SHIFT_EXISTS_MESSAGE);
    }
  }

  /**
   * Spec §7a rule 5: an EMPLOYEE writes only inside the current or previous
   * cycle. Once a cycle is paid its record stops moving.
   *
   * Takes however many instants the verb has to weigh — one for POST and
   * DELETE, two for PUT — so the "which instants?" question is answered at each
   * call site, where the answer is visible, rather than inside here.
   *
   * ADMIN is exempt, mirroring the open-shift asymmetry above and for the same
   * reason: they are the only actor who can repair a genuine historical error,
   * and locking them out would strand, among other things, the forgotten open
   * shift of a deactivated employee who can no longer log in to close it.
   *
   * ⚠️ Accepted consequence, recorded rather than discovered later: an error an
   * employee finds after the window has passed is permanent for them. There is
   * no correcting-entry mechanism, so only an admin can fix it. The window runs
   * one to two months, which covers when people actually notice — payday.
   */
  private async assertWritableCycle(
    callerRole: Role,
    ...instants: Date[]
  ): Promise<void> {
    if (callerRole === Role.ADMIN) return;

    const writableFrom = await this.settingsService.resolveWritableCycleStart();
    if (instants.some((at) => at.getTime() < writableFrom.getTime())) {
      throw badRequest(ErrorCode.CYCLE_LOCKED, CYCLE_LOCKED_MESSAGE);
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
      throw badRequest(
        ErrorCode.SHIFT_OVERLAP,
        'This shift overlaps an existing shift.',
      );
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
    writableFrom: Date | null,
  ): CycleTimeEntryDto {
    return {
      ...this.toResponseDto(entry),
      isSplit: isSplitAcrossCycle(entry.startTime, entry.endTime, range),
      // Anchored on startTime, the same instant the write rule tests. A split
      // shift that began before the window is therefore locked even though it
      // runs into it — correct, since part of it was paid in a closed cycle.
      canEdit:
        writableFrom === null ||
        entry.startTime.getTime() >= writableFrom.getTime(),
    };
  }
}
