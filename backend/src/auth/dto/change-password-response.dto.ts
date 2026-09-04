import { ApiProperty } from '@nestjs/swagger';

/**
 * Deliberately not `LoginResponseDto`: that one also carries `user`, which the
 * caller here already has — they were logged in a moment ago, and a password
 * change alters neither their name nor their role.
 */
export class ChangePasswordResponseDto {
  @ApiProperty({
    description:
      'A replacement JWT — send as `Authorization: Bearer <token>`. The change revoked every token issued before it, including the one that made this request, so a client that keeps using its old token is logged out on its next call. Store this one instead.',
  })
  accessToken!: string;
}
