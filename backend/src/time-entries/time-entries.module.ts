import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

/**
 * SettingsModule for cycle boundaries (never resolved here — it owns
 * AppSettings) and UsersModule for the one question this service asks about a
 * User: whether an employee with a given id exists.
 */
@Module({
  imports: [PrismaModule, SettingsModule, UsersModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
