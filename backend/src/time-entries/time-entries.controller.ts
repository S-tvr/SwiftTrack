import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '../generated/prisma/client';
import { TimeEntriesService } from './time-entries.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { CycleEntriesResponseDto } from './dto/cycle-entries-response.dto';
import { OpenShiftResponseDto } from './dto/open-shift-response.dto';
import { TimeEntryResponseDto } from './dto/time-entry-response.dto';

const CYCLE_QUERY = {
  name: 'cycle',
  required: false,
  example: '2026-07',
  description:
    'Cycle key (YYYY-MM) — the cycle that STARTS in that month. Omitted means the cycle containing now, which is not the current calendar month.',
};

@ApiTags('time-entries')
@ApiBearerAuth()
// 401 once for the whole controller — see architecture.md § Invariants.
@ApiResponse({ status: 401, description: 'Missing or invalid token.' })
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Post('clock-in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: 'Start a shift (EMPLOYEE)',
    description:
      'Writes startTime = now, endTime = null. The admin never clocks in — they have no Clock page. Fails if a shift is already open.',
  })
  @ApiResponse({
    status: 201,
    type: TimeEntryResponseDto,
    description: 'The newly opened shift, with `endTime: null`.',
  })
  @ApiResponse({ status: 400, description: 'An open shift already exists.' })
  @ApiResponse({ status: 403, description: 'Not an EMPLOYEE.' })
  clockIn(@CurrentUser() user: JwtPayload): Promise<TimeEntryResponseDto> {
    return this.timeEntriesService.clockIn(user.userId);
  }

  @Patch('clock-out')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: 'End the open shift (EMPLOYEE)',
    description:
      "Takes no id — it closes the caller's own open shift at now, and fails if there is none.",
  })
  @ApiResponse({
    status: 200,
    type: TimeEntryResponseDto,
    description: 'The shift just closed, with `endTime` set to now.',
  })
  @ApiResponse({ status: 400, description: 'No open shift to close.' })
  @ApiResponse({ status: 403, description: 'Not an EMPLOYEE.' })
  clockOut(@CurrentUser() user: JwtPayload): Promise<TimeEntryResponseDto> {
    return this.timeEntriesService.clockOut(user.userId);
  }

  @Get('open')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: "The caller's open shift, or null (EMPLOYEE)",
    description:
      'What the Clock page reads its button state from. It cannot use the list instead: an open shift started in the previous cycle is filtered out of the current one, and the button would render the wrong label. The entry is wrapped in { openShift } so the "not clocked in" answer is still valid JSON — a bare null leaves the body empty.',
  })
  @ApiResponse({
    status: 200,
    type: OpenShiftResponseDto,
    description:
      'Always an object: `{ openShift: … }` when a shift is open, `{ openShift: null }` when not. Never an empty body.',
  })
  @ApiResponse({ status: 403, description: 'Not an EMPLOYEE.' })
  findOpen(@CurrentUser() user: JwtPayload): Promise<OpenShiftResponseDto> {
    return this.timeEntriesService.findOpen(user.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: "The caller's own shifts for one cycle (EMPLOYEE)",
    description:
      'Same response shape as the admin route below, because both feed the same ShiftList and CycleNavigator. Includes open shifts, which is what the "Open" badge is rendered from. EMPLOYEE-only: an admin has no shifts of their own and reaches an employee\'s history through the route below.',
  })
  @ApiQuery(CYCLE_QUERY)
  @ApiResponse({
    status: 200,
    type: CycleEntriesResponseDto,
    description:
      'The resolved cycle block plus the shifts touching it — open ones included. No hours figure per shift: hours live only in GET /payroll (spec §4, decision 5f).',
  })
  @ApiResponse({ status: 400, description: 'Malformed cycle key.' })
  @ApiResponse({ status: 403, description: 'Not an EMPLOYEE.' })
  findMine(
    @CurrentUser() user: JwtPayload,
    @Query('cycle') cycle?: string,
  ): Promise<CycleEntriesResponseDto> {
    return this.timeEntriesService.findCycleEntries(user.userId, cycle);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "One employee's shifts for one cycle (ADMIN)",
    description:
      'The admin half of the shared ShiftList, at /shifts/:userId. userId is required — an admin has no shifts of their own.',
  })
  @ApiQuery({ name: 'userId', required: true, example: 2 })
  @ApiQuery(CYCLE_QUERY)
  @ApiResponse({
    status: 200,
    type: CycleEntriesResponseDto,
    description:
      "That employee's shifts for the cycle — the same shape as /time-entries/me, since both feed the same ShiftList.",
  })
  @ApiResponse({
    status: 400,
    description: 'Missing userId, or a malformed cycle key.',
  })
  @ApiResponse({ status: 403, description: 'Not an ADMIN.' })
  @ApiResponse({ status: 404, description: 'No such employee.' })
  findForEmployee(
    @Query('userId', ParseIntPipe) userId: number,
    @Query('cycle') cycle?: string,
  ): Promise<CycleEntriesResponseDto> {
    return this.timeEntriesService.findCycleEntriesForEmployee(userId, cycle);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Manually add a shift that has already ended (Owner or ADMIN)',
    description:
      'Distinct from clock-in: explicit times, and always closed. userId is required for an ADMIN and rejected for an EMPLOYEE. Rejected if either timestamp is in the future, if endTime precedes startTime, or if the shift overlaps another of the same user.',
  })
  @ApiResponse({
    status: 201,
    type: TimeEntryResponseDto,
    description: 'The created shift — always closed.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed, the shift overlaps another, or the employee has an open shift.',
  })
  @ApiResponse({ status: 404, description: 'No such employee.' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTimeEntryDto,
  ): Promise<TimeEntryResponseDto> {
    return this.timeEntriesService.create(user, dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Edit a shift (Owner or ADMIN)',
    description:
      'Also the route through which a forgotten clock-out is repaired with its real end time. A row belonging to someone else is a 404, not a 403 — the caller learns nothing about rows that are not theirs.',
  })
  @ApiResponse({
    status: 200,
    type: TimeEntryResponseDto,
    description:
      'The updated shift. Full replacement: omitting `notes` clears it.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed, the shift overlaps another, or the employee has an open shift.',
  })
  @ApiResponse({
    status: 404,
    description: 'No such shift, or not the caller’s.',
  })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTimeEntryDto,
  ): Promise<TimeEntryResponseDto> {
    return this.timeEntriesService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Delete a shift (Owner or ADMIN)',
    description:
      'Unlike POST and PUT, this is not blocked while the owner has an open shift — an employee may delete an open shift instead of clocking out of it. Safe (nothing unpayable is lost) but it discards the clock-in record rather than correcting it. A row belonging to someone else is a 404, not a 403.',
  })
  @ApiResponse({ status: 204, description: 'Deleted. No response body.' })
  @ApiResponse({ status: 400, description: 'Non-integer id.' })
  @ApiResponse({
    status: 404,
    description: 'No such shift, or not the caller’s.',
  })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.timeEntriesService.remove(user, id);
  }
}
