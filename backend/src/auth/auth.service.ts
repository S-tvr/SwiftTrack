import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ErrorCode } from '../common/error-codes';
import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
} from '../common/domain-errors';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt-payload.interface';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';
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

    const payload: JwtPayload = {
      userId: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
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

  /**
   * Lets an already-authenticated user (either role) set a new password
   * themselves — the one gap login/set-initial-password left open: neither
   * activated-account recovery nor a self-service rotation existed before this.
   *
   * `userId` comes from the caller's own JWT (never a body field), so this can
   * only ever act on the caller's own row — there is no "change someone else's
   * password" version of this method.
   *
   * **Revokes every token issued before this call** (step 8f), by bumping the
   * row's `tokenVersion` in the same UPDATE that stores the hash — so a change
   * made because a password leaked actually locks the other party out, instead
   * of leaving their copy working until it expires on its own. That includes
   * the caller's own token, which is why a replacement is signed and returned:
   * the session that performed the change is the one session kept alive.
   *
   * ⚠️ Refuses with **400, never 401** (step 8f). A wrong `currentPassword` is a
   * rejected body field, not a dead session — and the frontend logs the user out
   * on any 401 that carried a token, so a 401 here would throw them out of the
   * app for a typo and blame an expired session.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResponseDto> {
    const user = await this.usersService.findCredentialsById(userId);
    // `user.password` is null only for a never-activated account, and an
    // unactivated account cannot hold a valid JWT in the first place — so this
    // is unreachable in practice, not a case the caller can trigger.
    if (!user || user.password === null) {
      throw badRequest(
        ErrorCode.INVALID_CURRENT_PASSWORD,
        'Your current password is incorrect.',
      );
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!passwordMatches) {
      throw badRequest(
        ErrorCode.INVALID_CURRENT_PASSWORD,
        'Your current password is incorrect.',
      );
    }

    // A plain string comparison rather than a second bcrypt.compare: the line
    // above already proved currentPassword matches the stored hash, so the two
    // plaintexts being equal is exactly the same question, answered for free.
    if (newPassword === currentPassword) {
      throw badRequest(
        ErrorCode.NEW_PASSWORD_SAME_AS_CURRENT,
        'Your new password must be different from your current one.',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const tokenVersion = await this.usersService.updatePasswordAndRevokeTokens(
      userId,
      hashedPassword,
    );

    const payload: JwtPayload = { userId, role: user.role, tokenVersion };
    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
