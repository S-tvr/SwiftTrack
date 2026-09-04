import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Whatever this returns becomes req.user.
   *
   * The signature proves who the caller is, but not that they are still allowed
   * in: isActive can change after a token is issued, and the token cannot know
   * that. So identity comes from the payload and authority comes from the DB —
   * a user deactivated via DELETE /users/:id stops working immediately rather
   * than lingering until their token expires.
   *
   * role is read from the row for the same reason: it is current, not whatever
   * was true when the token was signed.
   *
   * tokenVersion (step 8f) is the same argument a third time, and the reason a
   * password change can revoke tokens at all: the row's counter is bumped by
   * changePassword, so every token signed before it stops matching here. This
   * costs no extra query — the row was already being read for isActive.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.usersService.findActiveById(payload.userId);
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException();
    }
    return {
      userId: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
  }
}
