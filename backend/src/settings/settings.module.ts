import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  // Time Entries (step 5) and Payroll (step 6) inject this rather than
  // resolving cycle boundaries themselves.
  exports: [SettingsService],
})
export class SettingsModule {}
