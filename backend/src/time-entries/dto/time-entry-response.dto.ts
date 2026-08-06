import { ApiProperty } from '@nestjs/swagger';

/**
 * A single shift, with no cycle context — what the write routes and
 * `GET /time-entries/open` return. The list routes return
 * `CycleTimeEntryDto` instead, which adds the two cycle-relative fields.
 */
export class TimeEntryResponseDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({
    example: 2,
    description:
      'Owner of the shift. Present so an admin reading someone else’s row can tell whose it is.',
  })
  userId!: number;

  @ApiProperty({ example: '2026-08-04T08:00:00.000Z', description: 'UTC.' })
  startTime!: string;

  @ApiProperty({
    example: '2026-08-04T16:00:00.000Z',
    nullable: true,
    description:
      'UTC, or null while the shift is open. Only clock-in produces an open shift; the manual write path always closes one.',
  })
  endTime!: string | null;

  @ApiProperty({ example: 'Covered for Anna', nullable: true })
  notes!: string | null;
}

/**
 * The same shift as seen from inside one pay cycle. Both fields come straight
 * from `cycle.util.ts`, so the Hours column in the UI adds up to what payroll
 * actually pays (spec §4 decision 5b).
 */
export class CycleTimeEntryDto extends TimeEntryResponseDto {
  @ApiProperty({
    example: 7.5,
    description:
      'Hours of this shift that fall INSIDE this cycle — not the shift’s full length. A shift crossing the boundary reports only its part on this side, and 0 for an open shift.',
  })
  hoursInCycle!: number;

  @ApiProperty({
    example: false,
    description:
      'True when the shift extends beyond this cycle in either direction, i.e. hoursInCycle is less than its full length. Always false for an open shift, which cannot be split.',
  })
  isSplit!: boolean;
}
