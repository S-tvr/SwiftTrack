import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { IsDayBefore } from './is-day-before.validator';

/**
 * Both fields are required — this is a full replacement of the two-field
 * settings object, not a patch.
 *
 * The 11-25 range is not arbitrary: every day in it exists in every month
 * (February included), so resolving a cycle never needs day-of-month clamping.
 */
export class UpdateSettingsDto {
  @ApiProperty({
    example: 25,
    minimum: 11,
    maximum: 25,
    description: 'Day of the month a pay cycle starts. Must be 11-25.',
  })
  @IsInt()
  @Min(11)
  @Max(25)
  cycleStartDay!: number;

  @ApiProperty({
    example: 24,
    minimum: 10,
    maximum: 24,
    description:
      'Day of the following month a pay cycle ends. Must be exactly cycleStartDay - 1, so that consecutive cycles are contiguous.',
  })
  @IsInt()
  @Min(10)
  @Max(24)
  @IsDayBefore('cycleStartDay')
  cycleEndDay!: number;
}
