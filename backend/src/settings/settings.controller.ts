import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SettingsService } from './settings.service';
import { SettingsResponseDto } from './dto/settings-response.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get the current pay-cycle settings',
    description:
      'Available to both roles — an employee needs the cycle days to make sense of their own shift and payroll pages.',
  })
  @ApiResponse({ status: 200, type: SettingsResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token.' })
  getSettings(): Promise<SettingsResponseDto> {
    return this.settingsService.getSettings();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Update the pay-cycle settings (ADMIN)',
    description:
      'cycleStartDay must be 11-25 and cycleEndDay exactly cycleStartDay - 1, so consecutive cycles are contiguous and no shift falls between them or into two at once.',
  })
  @ApiResponse({ status: 200, type: SettingsResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Day out of range, or the two days are not contiguous.',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token.' })
  @ApiResponse({ status: 403, description: 'Not an ADMIN.' })
  updateSettings(@Body() dto: UpdateSettingsDto): Promise<SettingsResponseDto> {
    return this.settingsService.updateSettings(dto);
  }
}
