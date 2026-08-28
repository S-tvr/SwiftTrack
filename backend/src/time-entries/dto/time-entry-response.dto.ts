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
 * The same shift as seen from inside one pay cycle.
 *
 * ⚠️ Deliberately carries **no hours figure**. It used to report `hoursInCycle`,
 * back when payroll was a flat rate and one shift's hours times one rate was
 * that shift's pay. Under rate zones that is no longer true — a shift running
 * 12:00-20:15 is 5.00 h at the base rate and 3.25 h at +33% — so a single
 * "Hours" number here would invite exactly the wrong sum, and would be a second
 * hours figure able to disagree with the payroll breakdown. Hours and money
 * live in one place: `GET /payroll` (spec §4, decisions 5c and 5e).
 */
export class CycleTimeEntryDto extends TimeEntryResponseDto {
  @ApiProperty({
    example: false,
    description:
      'True when the shift extends beyond this cycle in either direction — it started before this cycle opened, or ends after it closes. This is what explains the same shift appearing again when the ◀▶ navigator moves to the neighbouring cycle. Always false for an open shift, which cannot be split.',
  })
  isSplit!: boolean;

  @ApiProperty({
    example: true,
    description:
      'Whether **the caller** may still edit or delete this row (spec §7a rule 5) — one flag for both verbs, since the cycle lock treats them alike. Always true for an ADMIN. For an EMPLOYEE it is anchored on `startTime`, the same instant the write rule tests, so a split shift that began before the window is locked even though it runs into it — correct, because part of it was paid in a closed cycle.\n\nCycle-scoped only: it does not fold in the transient open-shift block, which clears on clock-out, does not apply to DELETE, and answers with its own `OPEN_SHIFT_EXISTS` code.',
  })
  canEdit!: boolean;
}
