import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
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
    description: 'Invalid credentials, not activated, or deactivated.',
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
      'Invalid setupCode, expired setupCode, or a deactivated account. A rejected attempt never consumes the code.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'Account already activated.' })
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
}
