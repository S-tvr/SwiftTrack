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
  @ApiOperation({ summary: 'Log in with email + password, returns a JWT' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
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
  @ApiResponse({ status: 200, description: 'Account activated.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired setupCode.' })
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
