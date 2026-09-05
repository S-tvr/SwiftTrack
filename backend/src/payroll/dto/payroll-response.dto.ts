import { ApiProperty } from '@nestjs/swagger';
import { CycleRangeDto } from '../../settings/dto/cycle-range.dto';
import { PayZone } from '../rate-zones.util';

/**
 * Hours worked on one date, split by rate zone. All four keys are always
 * present (0 where nothing was worked), so the client renders a fixed grid and
 * never handles a missing key.
 *
 * The property names are the `PayZone` values verbatim, so the day table can
 * look up a cell with the same key it drew the column from.
 */
export class DayZoneHoursDto {
  @ApiProperty({ example: 5, description: 'Mon-Fri 08:00-17:00.' })
  DAY!: number;

  @ApiProperty({ example: 3.25, description: 'Mon-Fri 17:00-24:00, +33%.' })
  EVENING!: number;

  @ApiProperty({ example: 0, description: 'Mon-Fri 00:00-08:00, +45%.' })
  NIGHT!: number;

  @ApiProperty({ example: 0, description: 'Sat & Sun, all day, +45%.' })
  WEEKEND!: number;
}

/**
 * One row of the day-by-day table. A row is a **date**, not a shift: the zones
 * are defined by calendar day, so a night shift running 22:00-06:00 appears as
 * evening hours on one date and night hours on the next.
 *
 * Only dates with hours are returned — a cycle is mostly days off, and printing
 * them would bury the days that matter.
 */
export class PayrollDayDto {
  @ApiProperty({
    example: '2026-07-28',
    description:
      'Calendar date, UTC. Format it as UTC on the client too — reading it in a negative-offset timezone would print the previous day against this row’s hours.',
  })
  date!: string;

  @ApiProperty({ type: DayZoneHoursDto })
  hours!: DayZoneHoursDto;

  @ApiProperty({
    example: 8.25,
    description:
      'The row total, already computed. Render it as sent — do not add the four cells yourself. They arrive as decimal numbers, and summing those in JavaScript disagrees with this figure about a third of the time (1.99 + 22.35 + 2.92 gives 27.259999999999998, not 27.26). The integers behind them do sum exactly· their decimal representations do not.',
  })
  totalHours!: number;
}

/**
 * One zone's line in the summary. Every figure here is reproducible by hand:
 * `hours x rate`, rounded, is exactly `pay`.
 */
export class PayrollZoneDto {
  @ApiProperty({
    enum: PayZone,
    example: PayZone.EVENING,
    description:
      'Stable key — also the key into PayrollDayDto.hours. NIGHT and WEEKEND share a rate but stay separate, because a client can merge two rows and never split one.',
  })
  zone!: PayZone;

  @ApiProperty({
    example: 'Evening +33%',
    description:
      'User-facing label including the surcharge (spec §8a), printed verbatim — the client derives no percentage of its own.',
  })
  label!: string;

  @ApiProperty({
    example: 5.25,
    description: 'Hours in this zone, 2 decimals.',
  })
  hours!: number;

  @ApiProperty({
    example: 3258.5,
    description:
      'ISK per hour for this zone: hourlyRate x the zone factor, exact to the hundredth and never rounded. A rate is not a payment, so this is the one figure in the system allowed decimals.',
  })
  rate!: number;

  @ApiProperty({
    example: 17107,
    description:
      'Whole ISK — the single point where money is rounded in the entire system.',
  })
  pay!: number;
}

/**
 * The payroll breakdown, returned identically by `/payroll/me` and
 * `/payroll/:userId` — the employee sees it at `/payroll` and the admin at
 * `/payroll/:userId` through the same shared component.
 *
 * Two views of the same hours: `zones` explains the money, `days` explains
 * where the hours came from. They cannot disagree — the zone totals are exact
 * sums of the day cells.
 */
export class PayrollResponseDto extends CycleRangeDto {
  @ApiProperty({ example: 4 })
  userId!: number;

  @ApiProperty({ example: 'Jane Employee' })
  name!: string;

  @ApiProperty({
    example: 2450,
    description:
      'Base ISK per hour used to price **this cycle** — the rate in force at the cycle start, always a whole number. Not necessarily what the employee is paid today: a later raise applies from the cycle after it was entered and does not change this figure. Every `zones[].rate` is this number times the zone factor.',
  })
  hourlyRate!: number;

  @ApiProperty({
    example: 42.62,
    description: 'Exact sum of every cell in `days`.',
  })
  totalHours!: number;

  @ApiProperty({
    example: 129060,
    description:
      'Whole ISK. A plain sum of `zones[].pay`, never a second rounding of its own — which is what makes the Pay column add up to it exactly.',
  })
  totalPay!: number;

  @ApiProperty({
    example: false,
    description:
      'True when a shift started inside this cycle and is still open. Open shifts are not payable, so their day is missing from `days` — this flag is what lets the page explain the gap instead of leaving the employee to wonder.',
  })
  hasOpenShift!: boolean;

  @ApiProperty({
    type: [PayrollZoneDto],
    description: 'Always four entries, in display order, zero hours included.',
  })
  zones!: PayrollZoneDto[];

  @ApiProperty({
    type: [PayrollDayDto],
    description: 'Worked dates only, ascending.',
  })
  days!: PayrollDayDto[];
}
