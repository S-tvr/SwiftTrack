import { ApiProperty } from '@nestjs/swagger';
import { CycleRangeDto } from '../../settings/dto/cycle-range.dto';
import { CycleTimeEntryDto } from './time-entry-response.dto';

/**
 * The shape returned by BOTH list routes — `/time-entries/me` and
 * `/time-entries?userId=`. They are identical on purpose: the employee sees
 * this at `/shifts` and the admin at `/shifts/:userId` through the same
 * `ShiftList` and the same `CycleNavigator`, so a difference between them would
 * be a difference the component has to branch on for no reason.
 *
 * Extends `CycleRangeDto` rather than nesting it: the cycle block is flat in
 * the response, and reusing the class keeps its definition in the one place
 * that owns cycle boundaries.
 */
export class CycleEntriesResponseDto extends CycleRangeDto {
  @ApiProperty({
    type: [CycleTimeEntryDto],
    description:
      'Shifts touching this cycle, newest first. Includes OPEN shifts whose startTime falls in the cycle — the list query is deliberately not the payroll query, because an employee who forgot to clock out needs a screen on which to find and fix it.',
  })
  entries!: CycleTimeEntryDto[];
}
