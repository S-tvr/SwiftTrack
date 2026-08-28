import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ErrorCode } from '../common/error-codes';
import { conflict, notFound, unauthorized } from '../common/domain-errors';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt-payload.interface';
import { LoginResponseDto } from './dto/login-response.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Same code and same message as a wrong password below: separating them
      // would let a caller enumerate which emails have accounts.
      throw unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password.',
      );
    }

    if (!user.isActive) {
      throw unauthorized(
        ErrorCode.ACCOUNT_DEACTIVATED,
        'This account is no longer active.',
      );
    }

    if (user.password === null) {
      throw unauthorized(
        ErrorCode.ACCOUNT_NOT_ACTIVATED,
        "This account hasn't been activated yet. Please activate it first.",
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password.',
      );
    }

    const payload: JwtPayload = { userId: user.id, role: user.role };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: this.usersService.toProfileDto(user),
    };
  }

  async setInitialPassword(
    email: string,
    setupCode: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw notFound(ErrorCode.USER_NOT_FOUND, 'User not found.');
    }

    // Checked before the activation state, mirroring login's ordering: an
    // account that is both deactivated and unactivated must be told it is
    // deactivated — telling it to activate would send the employee down a
    // path that can never succeed, since login re-checks isActive anyway.
    if (!user.isActive) {
      throw unauthorized(
        ErrorCode.ACCOUNT_DEACTIVATED,
        'This account is no longer active.',
      );
    }

    if (user.password !== null) {
      throw conflict(
        ErrorCode.ACCOUNT_ALREADY_ACTIVATED,
        'This account has already been activated.',
      );
    }

    if (user.setupCode !== setupCode) {
      throw unauthorized(
        ErrorCode.INVALID_SETUP_CODE,
        'Invalid activation code.',
      );
    }

    if (!user.setupCodeExpiresAt || new Date() > user.setupCodeExpiresAt) {
      throw unauthorized(
        ErrorCode.SETUP_CODE_EXPIRED,
        'This activation code has expired. Please contact your admin.',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.usersService.activateAccount(email, hashedPassword);
  }
}
