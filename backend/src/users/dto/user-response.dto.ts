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
      'The 4-digit activation code the admin hands to the employee out of band (spec §5). Non-null only while the employee is still pending — always null once activated, and always null for an ADMIN.',
  })
  setupCode!: string | null;

  @ApiPropertyOptional({
    example: '2026-08-29T09:12:44.000Z',
    nullable: true,
    description:
      'When the code above stops working — 3 days after it was issued. Set and cleared together with `setupCode`, so it is non-null in exactly the same cases. The Team page prints it as a date ("Valid until 29 August") rather than a duration, both in the dialog shown after creating an employee and on every pending row, so an admin can see one about to lapse and chase it before it does.',
  })
  setupCodeExpiresAt!: string | null;
}
