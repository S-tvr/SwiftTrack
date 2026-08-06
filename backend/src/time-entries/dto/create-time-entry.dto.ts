import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsNotBefore, IsNotInTheFuture } from './shift-time.validator';

/**
 * Manually adding a shift that has already ended — the "Add a forgotten or
 * missing shift" path. Distinct from clock-in, which writes
 * `startTime = now, endTime = null` and takes no input at all.
 *
 * `endTime` is required here (spec §7a rule 1): the form is the tool for closed
 * shifts, clock in/out is the tool for live ones. That is what keeps "at most
 * one open shift" enforceable in a single place instead of three.
 */
export class CreateTimeEntryDto {
  @ApiPropertyOptional({
    example: 2,
    description:
      'Who the shift belongs to. Required when an ADMIN calls, rejected when an EMPLOYEE calls (they always write to themselves). Optional here rather than in two DTOs because the rule depends on the caller’s role, which a DTO cannot see — TimeEntriesService enforces it.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;

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
      'End of the shift, UTC (ISO 8601). Required — the manual path never leaves a shift open. Never in the future, and never before startTime (equal is allowed).',
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
