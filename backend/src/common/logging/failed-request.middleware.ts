import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import type { JwtPayload } from '../../auth/jwt-payload.interface';

/**
 * One line per **failed** request — nothing for a successful one. Widening that
 * is a one-word change to the `statusCode < 400` test; narrowing it once people
 * rely on the volume is not.
 *
 * ⚠️ **Never reads `req.body` or `req.headers`, and must not be changed to.**
 * Not filtering — the absence of a path. Four endpoints take a secret in their
 * body (`/auth/login`, `/auth/set-initial-password`, `/auth/change-password`,
 * `POST /users`) and every authenticated request carries a bearer token; an
 * allowlist of safe fields is a list to maintain at each new DTO whose failure
 * mode is silent. This is what enforces architecture.md's "passwords are never
 * logged in plaintext" by construction. It is also why no domain `code` appears
 * here: reading one means reading the response body.
 */
@Injectable()
export class FailedRequestMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Request');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

    // `finish` is the first moment `statusCode` is final.
    res.on('finish', () => {
      if (res.statusCode < 400) return;

      const elapsedMs = Date.now() - startedAt;

      // `originalUrl` keeps the query string; every query param in this API is a
      // cycle key or a user id, and no endpoint takes a secret in one.
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs}ms`;

      // ⚠️ The `userId` alone, never the whole of `req.user` — it also holds
      // `tokenVersion`, a revocation counter with no business in a log.
      const user = req.user as JwtPayload | undefined;
      const suffix = user === undefined ? '' : ` user=${user.userId}`;

      if (res.statusCode >= 500) {
        this.logger.error(line + suffix);
      } else {
        this.logger.warn(line + suffix);
      }
    });

    next();
  }
}
