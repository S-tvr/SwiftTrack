import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Jane Employee' })
  name!: string;

  @ApiProperty({ example: 'jane@swifttrack.local' })
  email!: string;

  @ApiProperty({ enum: Role, example: Role.EMPLOYEE })
  role!: Role;

  @ApiPropertyOptional({ example: 3500, nullable: true })
  hourlyRate!: number | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    example: false,
    description: 'Derived: true once the employee has set their own password.',
  })
  hasActivated!: boolean;

  @ApiPropertyOptional({
    example: '7391',
    nullable: true,
    description:
      'The 4-digit activation code the admin hands to the employee out of band (spec §5). Non-null whenever the account has no password waiting to be set on it — an employee who has never activated, or one whose password an admin cleared with POST /users/:id/reset-password (step 8g). Always null once a password is set, and always null for an ADMIN.',
  })
  setupCode!: string | null;

  @ApiPropertyOptional({
    example: '2026-08-29T09:12:44.000Z',
    nullable: true,
    description:
      'When the code above stops working — 3 days after it was issued. Set and cleared together with `setupCode`, so it is non-null in exactly the same cases. The Team page prints it as a date ("Valid until 29 August") rather than a duration, both in the dialog shown after creating an employee and on every pending row, so an admin can see one about to lapse and chase it before it does.',
  })
  setupCodeExpiresAt!: string | null;

  @ApiPropertyOptional({
    example: 3800,
    nullable: true,
    description:
      'A rate change that has been entered but has not taken effect yet, or null when nothing is queued. `hourlyRate` above is what this employee is paid **now**, and payroll prices each cycle at the rate in force when it started — so between entering a raise and the next cycle opening, the two legitimately differ. Without this field that gap is invisible and reads as a failed save. Pending is relative to **now**, since the Team list is not a cycle-aware screen; `GET /payroll` answers the same question against the cycle it is showing.',
  })
  pendingRate!: number | null;

  @ApiPropertyOptional({
    example: '2026-09-25T00:00:00.000Z',
    nullable: true,
    description:
      'When the rate above starts applying — always the start of a pay cycle. Set and cleared together with `pendingRate`, so it is non-null in exactly the same cases.',
  })
  pendingRateEffectiveFrom!: string | null;
}
