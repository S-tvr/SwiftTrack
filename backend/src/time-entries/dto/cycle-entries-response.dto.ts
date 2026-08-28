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
    example: true,
    description:
      'Whether the caller may create a shift in this cycle at all (spec §7a rule 5). Always true for an ADMIN, who has no cycle limit. False for an EMPLOYEE looking at a cycle before their current or previous one, or at one that has not started yet — so the client can disable "Add Shift" rather than let the form be filled in and refused. It cannot be derived client-side: that would mean resolving cycle boundaries in the browser, which an invariant forbids.\n\n⚠️ Sibling of `entries`, deliberately **not** part of the cycle block above. Those five fields describe the *cycle* and are identical no matter who asks; this one describes the *caller* and changes with the token.\n\nCycle-scoped only — it does not account for the transient open-shift block, which answers separately with `OPEN_SHIFT_EXISTS`.',
  })
  canWrite!: boolean;

  @ApiProperty({
    type: [CycleTimeEntryDto],
    description:
      'Shifts touching this cycle, newest first. Includes OPEN shifts whose startTime falls in the cycle — the list query is deliberately not the payroll query, because an employee who forgot to clock out needs a screen on which to find and fix it.',
  })
  entries!: CycleTimeEntryDto[];
}
