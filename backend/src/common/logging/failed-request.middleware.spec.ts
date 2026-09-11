import type { Request } from 'express';

import { captureLogger } from './capture-logger.testing';
import { FailedRequestMiddleware } from './failed-request.middleware';

/**
 * The security property: **nothing a request carries ever reaches a log.** The
 * first test is what stops that from being quietly dismantled.
 *
 * ⚠️ Spiked: against a middleware that appends `JSON.stringify(req.body)`, the
 * first test fails.
 */
describe('FailedRequestMiddleware', () => {
  let logger: ReturnType<typeof captureLogger>;
  let middleware: FailedRequestMiddleware;

  beforeEach(() => {
    logger = captureLogger();
    middleware = new FailedRequestMiddleware();
  });

  afterEach(() => {
    logger.restore();
  });

  /** Runs the middleware and fires the `finish` event with the given status. */
  function run(request: Partial<Request>, statusCode: number): void {
    let finish = () => {};
    const res = {
      statusCode,
      on: (event: string, handler: () => void) => {
        if (event === 'finish') finish = handler;
      },
    };
    const next = jest.fn();

    middleware.use(request as Request, res as never, next);
    expect(next).toHaveBeenCalled();
    finish();
  }

  it('⭐ never writes a password, a token or anything else the request carried', () => {
    // Every secret this API accepts, in one request.
    run(
      {
        method: 'POST',
        originalUrl: '/auth/set-initial-password',
        body: {
          email: 'anna@demo.local',
          setupCode: '4821',
          newPassword: 'correct-horse-battery',
        },
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        },
      } as Partial<Request>,
      401,
    );

    expect(logger.text).not.toContain('correct-horse-battery');
    expect(logger.text).not.toContain('4821');
    expect(logger.text).not.toContain('Bearer');
    expect(logger.text).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

    // ⚠️ What makes the four above mean something: without it, a middleware
    // that writes nothing at all passes too.
    expect(logger.text).toContain('/auth/set-initial-password');
    expect(logger.text).toContain('401');
  });

  it('says nothing at all about a successful request', () => {
    run({ method: 'GET', originalUrl: '/payroll/me?cycle=2026-07' }, 200);

    expect(logger.lines).toHaveLength(0);
  });

  it('keeps the query string, which is only ever a cycle or a user id', () => {
    run({ method: 'GET', originalUrl: '/payroll/me?cycle=2026-07' }, 404);

    expect(logger.text).toContain('?cycle=2026-07');
  });

  it('logs the caller by id alone', () => {
    run(
      {
        method: 'POST',
        originalUrl: '/time-entries',
        // ⚠️ 77, not a single digit — that would occur by chance inside "400".
        user: { userId: 12, role: 'EMPLOYEE', tokenVersion: 77 },
      } as Partial<Request>,
      400,
    );

    expect(logger.text).toContain('user=12');
    expect(logger.text).not.toContain('tokenVersion');
    expect(logger.text).not.toContain('77');
  });

  it('writes exactly one line per failed request', () => {
    run({ method: 'GET', originalUrl: '/payroll/me' }, 404);

    expect(logger.lines).toHaveLength(1);
  });
});
