import { ApiProperty } from '@nestjs/swagger';
import { CycleRangeDto } from '../../settings/dto/cycle-range.dto';

/** One employee's line on the admin overview. */
export class PayrollOverviewRowDto {
  @ApiProperty({ example: 4 })
  userId!: number;

  @ApiProperty({ example: 'Jane Employee' })
  name!: string;

  @ApiProperty({ example: 42.62 })
  totalHours!: number;

  @ApiProperty({
    example: 129060,
    description: 'Whole ISK, computed exactly as on the employee’s own page.',
  })
  totalPay!: number;

  @ApiProperty({
    example: false,
    description:
      'A shift started inside this cycle and still open — hours that exist but are not being paid. Scoped to the cycle on purpose: a shift running right now is not a reason to flag a cycle from three months ago.',
  })
  hasOpenShift!: boolean;
}

/**
 * The admin's team-wide view for one cycle, in a single request.
 *
 * Deliberately one endpoint rather than one call per employee: the alternative
 * is N round trips from the browser, each paying for its own auth lookup and
 * its own settings read, with the team's total cost then added up client-side —
 * which would put payroll arithmetic in the frontend, where it may not live.
 */
export class PayrollOverviewResponseDto extends CycleRangeDto {
  @ApiProperty({
    example: 387180,
    description:
      'Whole ISK. A sum of the rows’ `totalPay` — each of those is a real, already-rounded wage, so adding them introduces no rounding of its own.',
  })
  totalCost!: number;

  @ApiProperty({
    type: [PayrollOverviewRowDto],
    description:
      'Every active employee, plus any deactivated employee with hours in this cycle — someone who left mid-cycle still worked and still has to be paid. Sorted by name.',
  })
  rows!: PayrollOverviewRowDto[];
}
