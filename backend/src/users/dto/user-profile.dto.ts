import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

/**
 * The logged-in user's own details — returned by GET /users/me and by
 * POST /auth/login.
 *
 * Deliberately declared standalone rather than derived from UserResponseDto:
 * that DTO serves the ADMIN endpoints and carries `setupCode`, the secret that
 * unlocks an unactivated account. Deriving this one from it (e.g. via OmitType)
 * would mean any field added there for the admin's benefit silently appears in
 * an auth response too. Fields land here only when written here on purpose.
 */
export class UserProfileDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Jane Employee' })
  name!: string;

  @ApiProperty({ example: 'jane@swifttrack.local' })
  email!: string;

  @ApiProperty({ enum: Role, example: Role.EMPLOYEE })
  role!: Role;

  @ApiPropertyOptional({
    example: 3500,
    nullable: true,
    description: 'ISK per hour. Always null for an ADMIN, who never clocks in.',
  })
  hourlyRate!: number | null;
}
