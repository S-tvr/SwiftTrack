import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Prisma, type User } from '../generated/prisma/client';

const SETUP_CODE_VALIDITY_DAYS = 3;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllEmployees(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => this.toResponseDto(user));
  }

  async findMe(userId: number): Promise<UserResponseDto> {
    const user = await this.findUserByIdOrThrow(userId);
    return this.toResponseDto(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async createEmployee(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          hourlyRate: dto.hourlyRate,
          role: 'EMPLOYEE',
          password: null,
          setupCode: this.generateSetupCode(),
          setupCodeExpiresAt: this.addDays(
            new Date(),
            SETUP_CODE_VALIDITY_DAYS,
          ),
        },
      });
      return this.toResponseDto(user);
    } catch (error) {
      // The check above handles the common case with a clean message, but two
      // concurrent creates (e.g. a double-clicked submit) can both pass it and
      // race to the insert. The DB unique index on email is the real guarantee —
      // translate its violation into the same 409 instead of leaking a 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists.');
      }
      throw error;
    }
  }

  async updateEmployee(
    id: number,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    await this.findEmployeeByIdOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
      },
    });
    return this.toResponseDto(user);
  }

  async deactivate(id: number): Promise<UserResponseDto> {
    await this.findEmployeeByIdOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toResponseDto(user);
  }

  async activateAccount(email: string, hashedPassword: string): Promise<User> {
    return this.prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        setupCode: null,
        setupCodeExpiresAt: null,
      },
    });
  }

  /** Any user, regardless of role — used by /users/me, which serves both roles. */
  private async findUserByIdOrThrow(id: number): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }
    return user;
  }

  /**
   * Employees only. Admin accounts are deliberately out of reach of the
   * update/deactivate routes: an admin has no hourlyRate by design (spec §3),
   * and deactivating the only admin would lock everyone out of the system with
   * no reactivation endpoint to recover through.
   */
  private async findEmployeeByIdOrThrow(id: number): Promise<User> {
    const employee = await this.prisma.user.findFirst({
      where: { id, role: 'EMPLOYEE' },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found.`);
    }
    return employee;
  }

  private generateSetupCode(): string {
    // CSPRNG, not Math.random() — this code is the only thing gating access to
    // an unactivated account. randomInt's upper bound is exclusive.
    return randomInt(1000, 10000).toString();
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hourlyRate: user.hourlyRate,
      isActive: user.isActive,
      hasActivated: user.password !== null,
      setupCode: user.setupCode,
    };
  }
}
