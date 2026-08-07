import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { PayrollService } from './payroll.service';
import { PayrollResponseDto } from './dto/payroll-response.dto';
import { PayrollOverviewResponseDto } from './dto/payroll-overview-response.dto';

const CYCLE_QUERY = {
  name: 'cycle',
  required: false,
  example: '2026-07',
  description:
    'Cycle key (YYYY-MM) — the cycle that STARTS in that month. Omitted means the cycle containing now, which is not the current calendar month.',
};

@ApiTags('payroll')
@ApiBearerAuth()
// 401 once for the whole controller — see architecture.md § Invariants.
@ApiResponse({ status: 401, description: 'Missing or invalid token.' })
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  // ⚠️ `me` and `overview` are declared before `:userId`. Nest matches routes in
  // declaration order, so the parameterised route placed first would swallow
  // both literals and answer with a 400 from ParseIntPipe.

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: 'My own payroll breakdown (EMPLOYEE)',
    description:
      'The admin has no payroll of their own — they never clock in and have no hourlyRate.',
  })
  @ApiQuery(CYCLE_QUERY)
  @ApiResponse({
    status: 200,
    type: PayrollResponseDto,
    description:
      "The caller's breakdown for the resolved cycle: the four zones with hours/rate/pay, and a row per date with hours only. Render `zones[]` as a list, never as hardcoded columns.",
  })
  @ApiResponse({ status: 400, description: 'Malformed cycle key.' })
  @ApiResponse({ status: 403, description: 'Not an EMPLOYEE.' })
  getMyPayroll(
    @CurrentUser() user: JwtPayload,
    @Query('cycle') cycle?: string,
  ): Promise<PayrollResponseDto> {
    return this.payrollService.getPayrollForCycle(user.userId, cycle);
  }

  @Get('overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Team payroll overview for one cycle (ADMIN)',
    description:
      'One request for the whole team: hours, pay and an open-shift flag per employee, plus the total cost. Every active employee appears, plus any deactivated one with hours in this cycle.',
  })
  @ApiQuery(CYCLE_QUERY)
  @ApiResponse({
    status: 200,
    type: PayrollOverviewResponseDto,
    description:
      "One row per employee plus the team's `totalCost`. Each row equals that employee's own page exactly — both come from the same calculation.",
  })
  @ApiResponse({ status: 400, description: 'Malformed cycle key.' })
  @ApiResponse({ status: 403, description: 'Not an ADMIN.' })
  getOverview(
    @Query('cycle') cycle?: string,
  ): Promise<PayrollOverviewResponseDto> {
    return this.payrollService.getOverview(cycle);
  }

  @Get(':userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "One employee's payroll breakdown (ADMIN)",
    description:
      'Identical shape to /payroll/me — both feed the same shared PayrollBreakdown component. A deactivated employee resolves normally: they still worked the hours.',
  })
  @ApiQuery(CYCLE_QUERY)
  @ApiResponse({
    status: 200,
    type: PayrollResponseDto,
    description:
      "That employee's breakdown — byte-identical in shape to /payroll/me.",
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed cycle key, or a userId that is not an integer.',
  })
  @ApiResponse({ status: 403, description: 'Not an ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'No EMPLOYEE with this id — an admin id included.',
  })
  getPayrollForEmployee(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('cycle') cycle?: string,
  ): Promise<PayrollResponseDto> {
    return this.payrollService.getPayrollForCycle(userId, cycle);
  }
}
