import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all employees (ADMIN)' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  findAllEmployees(): Promise<UserResponseDto[]> {
    return this.usersService.findAllEmployees();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the logged-in user's own details" })
  @ApiResponse({ status: 200, type: UserProfileDto })
  findMe(@CurrentUser() user: JwtPayload): Promise<UserProfileDto> {
    return this.usersService.findMe(user.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a new employee (ADMIN)' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  createEmployee(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createEmployee(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: "Edit an employee's name/hourlyRate (ADMIN)" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateEmployee(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Deactivate an employee (ADMIN)',
    description: 'Soft delete — sets isActive = false, never removes the row.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  deactivate(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.deactivate(id);
  }
}
