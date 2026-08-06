import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * `SettingsModule` for cycle boundaries and `UsersModule` for employee names
 * and rates — this module owns neither model and queries neither directly.
 */
@Module({
  imports: [PrismaModule, SettingsModule, UsersModule],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
