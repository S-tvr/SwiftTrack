import { ApiProperty } from '@nestjs/swagger';
import { UserProfileDto } from '../../users/dto/user-profile.dto';

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT — send as `Authorization: Bearer <token>`.',
  })
  accessToken!: string;

  @ApiProperty({
    type: UserProfileDto,
    description:
      "The logged-in user. Returned alongside the token so the client doesn't need a follow-up GET /users/me just to render the header.",
  })
  user!: UserProfileDto;
}
