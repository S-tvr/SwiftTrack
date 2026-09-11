import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';

import type { JwtPayload } from '../../auth/jwt-payload.interface';

/**
 * Logs 5xx with its stack and the request that caused it, then hands the
 * exception back to Nest unchanged.
 *
 * ⚠️ **Never touches the response body** — every branch ends in `super.catch()`,
 * pinned by `logging.e2e-spec.ts`. `domain-errors.ts` rejected a filter that
 * *decides* bodies (it would need a status → code map); this one only reads, so
 * the four factories there remain the only thing a client's error text comes
 * from.
 *
 * ⚠️ **Only `HttpException`s with a 5xx.** Nest's `BaseExceptionFilter` already
 * logs everything else, so logging it here too would print every crash twice.
 * What it never logs is the three deliberate `InternalServerErrorException`s
 * (missing `AppSettings`, out-of-range `cycleStartDay`, `null hourlyRate`) —
 * each naming its own fix in a message nothing used to print.
 *
 * ⚠️ **4xx stays silent here**, and not for tidiness: `ValidationPipe`'s 400s
 * put the **submitted values** in `getResponse()`. `FailedRequestMiddleware`
 * records those failures without reading anything the request carried, so a 5xx
 * produces two lines — this one's stack, and the middleware's duration, which a
 * filter cannot measure. Both counts are pinned by unit tests.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    // No `host.getType()` guard: this app is HTTP and nothing else, so the
    // branch would never execute and never be tested.
    this.logServerError(exception, host);
    super.catch(exception, host);
  }

  private logServerError(exception: unknown, host: ArgumentsHost): void {
    if (!(exception instanceof HttpException)) return;

    // `getStatus()` is typed `number`, so the constant is widened rather than
    // compared across two enum types.
    const status: number = exception.getStatus();
    if (status < Number(HttpStatus.INTERNAL_SERVER_ERROR)) return;

    const request = host.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;
    const who = user === undefined ? '' : ` user=${user.userId}`;

    // `message`, never `getResponse()` — see the 4xx note above.
    this.logger.error(
      `${request.method} ${request.originalUrl} ${status}${who} — ${exception.message}`,
      exception.stack,
    );
  }
}
