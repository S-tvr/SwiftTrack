import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { IsDayBefore } from './is-day-before.validator';

/**
 * Both fields are required — this is a full replacement of the two-field
 * settings object, not a patch.
 *
 * The 20-25 range is a **business rule**: a real pay cycle starts at the end of
 * the month, and the days below 20 were theoretical flexibility nobody used.
 * Narrowed from 11-25 deliberately — the wider range was never wrong, it was
 * offering choices that do not occur.
 *
 * It also keeps the property the original range was chosen for: every day in it
 * exists in every month (February included), so resolving a cycle never needs
 * day-of-month clamping.
 */
export class UpdateSettingsDto {
  @ApiProperty({
    example: 25,
    minimum: 20,
    maximum: 25,
    description: 'Day of the month a pay cycle starts. Must be 20-25.',
  })
  @IsInt()
  @Min(20)
  @Max(25)
  cycleStartDay!: number;

  @ApiProperty({
    example: 24,
    minimum: 19,
    maximum: 24,
    description:
      'Day of the following month a pay cycle ends. Must be exactly cycleStartDay - 1, so that consecutive cycles are contiguous.',
  })
  @IsInt()
  @Min(19)
  @Max(24)
  @IsDayBefore('cycleStartDay')
  cycleEndDay!: number;
}
