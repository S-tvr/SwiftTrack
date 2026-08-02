import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Whatever this returns becomes req.user. Trusts the signed payload — no DB
  // lookup per request (deliberate: see architect session for Step 3). Rebuilt
  // field by field rather than returned as-is, so req.user holds exactly what
  // JwtPayload declares and nothing downstream can lean on iat/exp.
  validate(payload: JwtPayload): JwtPayload {
    return { userId: payload.userId, role: payload.role };
  }
}
