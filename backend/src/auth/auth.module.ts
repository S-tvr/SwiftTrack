import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

// Shortened from 14d in step 8f. This is a shift-tracking app: an employee logs
// in for a shift, so half a day means roughly one login per shift — normal for a
// workplace tool — while cutting the window a stolen token stays usable from
// weeks to hours. Orthogonal to the tokenVersion revocation added in the same
// step: that one fires when a user asks for protection, this one bounds every
// token whether they ask or not.
const JWT_EXPIRY = '12h';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: JWT_EXPIRY },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
