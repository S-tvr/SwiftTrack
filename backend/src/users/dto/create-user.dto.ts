import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane Employee' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'jane@swifttrack.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 3500, description: 'ISK per hour, whole number' })
  @IsInt()
  @Min(1)
  hourlyRate!: number;
}
