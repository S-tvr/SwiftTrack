import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

/**
 * SettingsModule for cycle boundaries (never resolved here — it owns
 * AppSettings), UsersModule for the one question this service asks about a
 * User (whether an employee with a given id exists), and AuditModule for the
 * history behind create/update/delete — spec §13 gap 2.
 */
@Module({
  imports: [PrismaModule, SettingsModule, UsersModule, AuditModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
