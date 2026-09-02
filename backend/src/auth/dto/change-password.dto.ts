import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'CKeI2EjVAONU' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ example: 'a-strong-new-password' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
