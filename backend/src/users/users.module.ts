import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // SettingsModule joins for one question only: when does a new rate start
  // applying. Cycle boundaries are derived from AppSettings, which this module
  // does not own, so it asks rather than computing (see architecture.md
  // § Invariants). Safe in this direction — Settings imports nothing from Users.
  imports: [PrismaModule, SettingsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
