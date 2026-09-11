import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Request } from 'express';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { captureLogger } from './capture-logger.testing';

/**
 * Two properties: a 5xx reaches the log with its stack, and the response body is
 * left to Nest. The security property lives in
 * `failed-request.middleware.spec.ts`, beside the class that owns it.
 *
 * ⚠️ Spiked: removing the 5xx branch fails two of these; rewriting the response
 * body fails four in `logging.e2e-spec.ts`.
 */

/** The slice of `ArgumentsHost` that `BaseExceptionFilter.catch` actually uses. */
function hostFor(request: Partial<Request>, response: unknown): ArgumentsHost {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getArgByIndex: (index: number) => (index === 1 ? response : request),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let logger: ReturnType<typeof captureLogger>;
  let filter: AllExceptionsFilter;
  let replies: Array<{ body: unknown; status: number }>;

  beforeEach(() => {
    logger = captureLogger();
    replies = [];

    // The minimum of an HttpAdapter that `BaseExceptionFilter.catch` uses,
    // recording what Nest decided to send.
    const httpAdapter = {
      isHeadersSent: () => false,
      reply: (_res: unknown, body: unknown, status: number) => {
        replies.push({ body, status });
      },
      end: () => {},
    };

    filter = new AllExceptionsFilter(httpAdapter as never);
  });

  afterEach(() => {
    logger.restore();
  });

  describe('a 5xx is logged with its route and stack', () => {
    it('logs the deliberate InternalServerErrorException with its guidance', () => {
      // The real one from SettingsService, which Nest's own filter never logs.
      const exception = new InternalServerErrorException(
        'Settings not initialised. Run `npx prisma db seed`.',
      );

      filter.catch(
        exception,
        hostFor(
          { method: 'GET', originalUrl: '/payroll/overview', user: undefined },
          {},
        ),
      );

      expect(logger.text).toContain('GET /payroll/overview');
      expect(logger.text).toContain('500');
      expect(logger.text).toContain('Settings not initialised');
    });

    it('names the caller when the request was authenticated', () => {
      filter.catch(
        new InternalServerErrorException('boom'),
        hostFor(
          {
            method: 'GET',
            originalUrl: '/payroll/me',
            // ⚠️ 77, not a single digit — that would occur by chance inside
            // "500" and make the last assertion pass or fail for the wrong
            // reason.
            user: { userId: 12, role: 'EMPLOYEE', tokenVersion: 77 },
          } as Partial<Request>,
          {},
        ),
      );

      expect(logger.text).toContain('user=12');
      expect(logger.text).not.toContain('tokenVersion');
      expect(logger.text).not.toContain('77');
    });

    it('writes the stack exactly once', () => {
      // Counterpart to the middleware's "exactly one line": together they pin a
      // 5xx at two lines total, so neither count can drift unnoticed.
      filter.catch(
        new InternalServerErrorException('boom'),
        hostFor({ method: 'GET', originalUrl: '/payroll/overview' }, {}),
      );

      expect(logger.lines).toHaveLength(1);
    });

    it('stays silent for a 4xx — the middleware owns that line', () => {
      filter.catch(
        new BadRequestException({
          statusCode: 400,
          code: 'SHIFT_OVERLAP',
          message: 'This shift overlaps an existing shift.',
        }),
        hostFor({ method: 'POST', originalUrl: '/time-entries' }, {}),
      );

      expect(logger.lines).toHaveLength(0);
    });
  });

  describe('the response body is untouched', () => {
    it('passes a domain error through exactly as the factories built it', () => {
      // The contract `domain-errors.ts` owns, and the whole justification for
      // reopening the filter that file rejected.
      const body = {
        statusCode: 400,
        code: 'SHIFT_OVERLAP',
        message: 'This shift overlaps an existing shift.',
      };

      filter.catch(
        new BadRequestException(body),
        hostFor({ method: 'POST', originalUrl: '/time-entries' }, {}),
      );

      expect(replies).toHaveLength(1);
      expect(replies[0].status).toBe(HttpStatus.BAD_REQUEST);
      expect(replies[0].body).toEqual(body);
    });

    it('still replies for a 5xx it logged', () => {
      filter.catch(
        new InternalServerErrorException('boom'),
        hostFor({ method: 'GET', originalUrl: '/payroll/overview' }, {}),
      );

      expect(replies).toHaveLength(1);
      expect(replies[0].status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
