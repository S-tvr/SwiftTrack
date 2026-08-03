import { ApiProperty } from '@nestjs/swagger';

export class SettingsResponseDto {
  @ApiProperty({
    example: 25,
    minimum: 11,
    maximum: 25,
    description:
      'Day of the month a pay cycle starts. The only field the cycle arithmetic reads.',
  })
  cycleStartDay!: number;

  @ApiProperty({
    example: 24,
    minimum: 10,
    maximum: 24,
    description:
      'Day of the following month a pay cycle ends. Always exactly cycleStartDay - 1 — stored and validated, but derived.',
  })
  cycleEndDay!: number;
}
