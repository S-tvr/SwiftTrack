import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { FailedRequestMiddleware } from './common/logging/failed-request.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { PayrollModule } from './payroll/payroll.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 5 }]),
    PrismaModule,
    UsersModule,
    AuthModule,
    SettingsModule,
    TimeEntriesModule,
    PayrollModule,
  ],
})
export class AppModule implements NestModule {
  /**
   * Wired here rather than in `main.ts` deliberately: a testing app is built
   * from this module graph but never runs `main.ts`, so anything registered
   * there must be repeated in `test/helpers/app.ts` (as the pipe, CORS and the
   * exception filter all are). A module-declared middleware cannot drift.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(FailedRequestMiddleware).forRoutes('*');
  }
}
