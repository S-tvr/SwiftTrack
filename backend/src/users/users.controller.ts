import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all employees (ADMIN)',
    description: 'Guard (JwtAuthGuard + RolesGuard(ADMIN)) is wired in Step 3.',
  })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  findAllEmployees(): Promise<UserResponseDto[]> {
    return this.usersService.findAllEmployees();
  }

  @Get('me')
  @ApiOperation({
    summary: "Get the logged-in user's own details",
    description:
      'Reads req.user.userId, populated by JwtAuthGuard once it exists (Step 3).',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  findMe(
    @Req() req: Request & { user?: { userId: number } },
  ): Promise<UserResponseDto> {
    return this.usersService.findMe(req.user!.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new employee (ADMIN)' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  createEmployee(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createEmployee(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: "Edit an employee's name/hourlyRate (ADMIN)" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateEmployee(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deactivate an employee (ADMIN)',
    description: 'Soft delete — sets isActive = false, never removes the row.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  deactivate(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.deactivate(id);
  }
}
