import {
  Body,
  Controller,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { JwtPayload } from './jwt-payload.interface';
import { LoginDto } from './dto/login.dto';
import { SetInitialPasswordDto } from './dto/set-initial-password.dto';
import { LoginResponseDto } from './dto/login-response.dto';

@ApiTags('auth')
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in with email + password, returns a JWT',
    description:
      'The token is valid for 14 days and there is no refresh mechanism. It carries only { userId, role }, which is why the user object is returned alongside it — the Header needs a name on every page. An unknown email answers 401, never 404: at this endpoint the caller has proved nothing, so it learns nothing.',
  })
  @ApiResponse({
    status: 200,
    type: LoginResponseDto,
    description:
      "A 14-day access token plus the caller's own profile (UserProfileDto, never carrying setupCode).",
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed — a missing field, a malformed email, or a property the DTO does not declare.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Codes: `INVALID_CREDENTIALS` (an unknown email and a wrong password answer with the same one, deliberately — separate codes would let a caller enumerate accounts), `ACCOUNT_NOT_ACTIVATED`, `ACCOUNT_DEACTIVATED`. The three are distinguishable because each needs a different action from the user.',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limited — more than 5 attempts from one IP in 60s.',
  })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('set-initial-password')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Activate a new employee account (email + setupCode + new password)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Account activated — the password is stored hashed and the setupCode is cleared, so it can never be reused.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed — a setupCode that is not exactly 4 digits, a newPassword under 8 characters, a malformed email, or a property the DTO does not declare. Note the shape of the code is rejected here, before it is ever compared: a wrong-but-well-formed code is the 401 below.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Codes: `INVALID_SETUP_CODE`, `SETUP_CODE_EXPIRED` (kept apart: one means retype it, the other means ask the admin for a new one via POST /users/:id/reset-setup-code), `ACCOUNT_DEACTIVATED`. A rejected attempt never consumes the code.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Code: `USER_NOT_FOUND` — no account with this email. Deliberately distinguishable from a wrong code: in an internal tool where the admin creates every account, "you typed the wrong email" is the more useful answer, and enumeration protection guards a secret that has no value here. ⚠️ Revisit if this ever becomes multi-tenant.',
  })
  @ApiResponse({
    status: 409,
    description: 'Code: `ACCOUNT_ALREADY_ACTIVATED`.',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limited — more than 5 attempts from one IP in 60s.',
  })
  async setInitialPassword(@Body() dto: SetInitialPasswordDto): Promise<void> {
    await this.authService.setInitialPassword(
      dto.email,
      dto.setupCode,
      dto.newPassword,
    );
  }

  @Patch('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the logged-in user’s own password (both roles)',
    description:
      'The one gap login/set-initial-password left open: an already-activated account had no self-service way to rotate or recover its password short of a database edit. Acts only on the caller’s own row — userId comes from the JWT, never from the body. ⚠️ Not rate-limited, unlike the other two auth routes: unlike login, a request here already requires a valid token, so brute-forcing currentPassword needs a stolen session first, not just a guessable email. ⚠️ Does not invalidate tokens already issued — this API has no refresh/revocation mechanism (a deliberate Phase 1 gap), so a token minted before the change stays valid until its own 14-day expiry.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed — stored hashed, as everywhere else.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed — newPassword under 8 characters, or a property the DTO does not declare.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing/invalid token (guard-level, no code), or code `INVALID_CURRENT_PASSWORD` — currentPassword did not match.',
  })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
