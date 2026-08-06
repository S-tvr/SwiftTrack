import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsNotBefore, IsNotInTheFuture } from './shift-time.validator';

/**
 * Editing an existing shift. Declared standalone rather than derived from
 * `CreateTimeEntryDto` with `OmitType`, for the same reason `UserProfileDto` is:
 * subtractive derivation leaks by default. `userId` must never be accepted here
 * — on create it assigns a shift, here it would *move* one between people — and
 * with `OmitType` that guarantee would depend on nobody ever re-adding it to
 * the create DTO under a different name.
 *
 * Not a `PartialType` either: both timestamps are required, which is what
 * `ShiftForm` sends anyway, and it keeps rule 1 (§7a) as one rule rather than a
 * second "may be omitted but never null" case to reason about.
 */
export class UpdateTimeEntryDto {
  @ApiProperty({
    example: '2026-08-04T08:00:00.000Z',
    description: 'Start of the shift, UTC (ISO 8601). Never in the future.',
  })
  @IsISO8601({ strict: true })
  @IsNotInTheFuture({ message: 'Start time cannot be in the future.' })
  startTime!: string;

  @ApiProperty({
    example: '2026-08-04T16:00:00.000Z',
    description:
      'End of the shift, UTC (ISO 8601). Required — editing never reopens a closed shift, and this is the route through which a forgotten clock-out is repaired with its real end time.',
  })
  @IsISO8601({ strict: true })
  @IsNotInTheFuture({ message: 'End time cannot be in the future.' })
  @IsNotBefore('startTime', {
    message: 'End time cannot be before start time.',
  })
  endTime!: string;

  @ApiPropertyOptional({ example: 'Covered for Anna', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
