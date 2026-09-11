import { Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * ⚠️ Deliberately imports **no** `PrismaModule`. `AuditService` never holds a
 * client of its own — every method takes the caller's transaction client, which
 * is what forces the audit row into the same transaction as the mutation it
 * describes (see `audit.service.ts`). A `PrismaService` injected here would be a
 * second door, and a caller taking it would write a row that survives a
 * rolled-back change.
 *
 * Declared on `AppModule` like every other feature module, so the e2e suite
 * inherits it with the module graph and `test/helpers/app.ts` needs no line —
 * the same property `FailedRequestMiddleware` has and the exception filter
 * does not.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
