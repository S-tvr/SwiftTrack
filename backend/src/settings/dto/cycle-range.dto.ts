import { ApiProperty } from '@nestjs/swagger';

/**
 * The resolved-cycle block carried by every cycle-aware response (time entries
 * list, payroll breakdown). The backend is the single source of truth for
 * cycle boundaries: the frontend displays these and never derives its own.
 */
export class CycleRangeDto {
  @ApiProperty({
    example: '2026-07',
    description:
      'The resolved cycle key — the cycle that STARTS in this month. Echoed back so the client knows which cycle it got when ?cycle= was omitted.',
  })
  cycle!: string;

  @ApiProperty({
    example: '2026-06',
    description:
      'Key for the previous cycle. The ◀ button sends this back verbatim — the frontend never does month arithmetic.',
  })
  prevCycle!: string;

  @ApiProperty({ example: '2026-08', description: 'Key for the next cycle.' })
  nextCycle!: string;

  @ApiProperty({
    example: '2026-07-25T00:00:00.000Z',
    description: 'First instant of the cycle, UTC.',
  })
  cycleStart!: string;

  @ApiProperty({
    example: '2026-08-24T23:59:59.999Z',
    description:
      'Last instant INSIDE the cycle, UTC — for display only. Internally the backend compares against the exclusive boundary (the following midnight), which is also the next cycle’s start.',
  })
  cycleEnd!: string;
}
