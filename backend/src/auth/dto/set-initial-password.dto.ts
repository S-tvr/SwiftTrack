import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class SetInitialPasswordDto {
  @ApiProperty({ example: 'jane@swifttrack.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: '7391',
    description: 'The 4-digit setupCode the admin handed the employee.',
  })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'setupCode must be exactly 4 digits.' })
  setupCode!: string;

  @ApiProperty({ example: 'a-strong-new-password' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
