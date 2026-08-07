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
// 401 once for the whole controller — see architecture.md § Invariants.
@ApiResponse({ status: 401, description: 'Missing or invalid token.' })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'List all employees (ADMIN)',
    description:
      'EMPLOYEE rows only — the admin never appears in their own team list. Deactivated employees are included, so the client decides how to show them. `setupCode` is non-null only while an employee is still pending: the admin has no other channel to obtain it, and account activation depends on handing it over out of band.',
  })
  @ApiResponse({
    status: 200,
    type: [UserResponseDto],
    description:
      'Every employee, active and deactivated, sorted by name. Empty array before the first one is created.',
  })
  @ApiResponse({ status: 403, description: 'Not an ADMIN.' })
  findAllEmployees(): Promise<UserResponseDto[]> {
    return this.usersService.findAllEmployees();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Get the logged-in user's own details",
    description:
      'Serves both roles, so there is no 403 here. Returns UserProfileDto rather than the admin-facing UserResponseDto: a self-view never carries `setupCode`, the secret that unlocks an unactivated account.',
  })
  @ApiResponse({
    status: 200,
    type: UserProfileDto,
    description: "The caller's own profile.",
  })
  findMe(@CurrentUser() user: JwtPayload): Promise<UserProfileDto> {
    return this.usersService.findMe(user.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create a new employee (ADMIN)',
    description:
      'Creates the row with `password: null` and generates a 4-digit `setupCode` valid for 3 days — the employee sets their own password through POST /auth/set-initial-password. A `password` field in the body is rejected by the global ValidationPipe, not merely ignored.',
  })
  @ApiResponse({
    status: 201,
    type: UserResponseDto,
    description:
      'The created employee. `setupCode` is populated here and in GET /users — this is the only place the admin can read it, and spec §5 requires handing it over out of band.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed — a missing/malformed field, or a property the DTO does not declare (`password` included).',
  })
  @ApiResponse({ status: 403, description: 'Not an ADMIN.' })
  @ApiResponse({
    status: 409,
    description: 'A user with this email already exists.',
  })
  createEmployee(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createEmployee(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: "Edit an employee's name/hourlyRate (ADMIN)",
    description:
      'Only `name` and `hourlyRate` — email, password, role and isActive each have their own channel. EMPLOYEE rows only: an ADMIN id is a 404, because an admin has no hourlyRate by design. ⚠️ Payroll is recomputed on every request and never frozen, so changing a rate also changes what every past cycle reports.',
  })
  @ApiResponse({
    status: 200,
    type: UserResponseDto,
    description: 'The updated employee.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed, or a non-integer id.',
  })
  @ApiResponse({ status: 403, description: 'Not an ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'No EMPLOYEE with this id — an admin id included.',
  })
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
    description:
      'Soft delete — sets `isActive = false` and never removes the row, so their shifts and payroll history survive. Takes effect immediately: JwtStrategy re-checks isActive on every request, so a token issued before this call stops working at once. The employee still appears in GET /users and still counts toward payroll for cycles they worked. EMPLOYEE rows only: an ADMIN id is a 404, since deactivating the only admin is unrecoverable through the API.',
  })
  @ApiResponse({
    status: 200,
    type: UserResponseDto,
    description: 'The updated employee, with `isActive: false`.',
  })
  @ApiResponse({ status: 400, description: 'Non-integer id.' })
  @ApiResponse({ status: 403, description: 'Not an ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'No EMPLOYEE with this id — an admin id included.',
  })
  deactivate(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.deactivate(id);
  }
}
