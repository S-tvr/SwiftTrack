import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ErrorCode } from './error-codes';

/**
 * The body every domain exception serialises to. A superset of what Nest builds
 * for a string response: `error: 'Bad Request'` is dropped, being redundant
 * beside `statusCode` and already optional in the e2e `ErrorBody` type.
 */
export interface DomainErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
}

/**
 * Four factories, one per status this API refuses with. Every domain `throw` in
 * `src/` goes through one of them, which is what makes "carries a code" a
 * property of the mechanism rather than a rule someone has to remember at each
 * new throw site.
 *
 * Two mechanics of `@nestjs/common` decide the shape here, both verified
 * against the installed source (11.1.28) rather than assumed:
 *
 * 1. `HttpException.createBody()` returns an **object** response verbatim — it
 *    does not merge in a `statusCode` the way it does for a string. So the
 *    status is written into the body explicitly here; omitting it would quietly
 *    remove a field every existing error response carries.
 * 2. `HttpException.initMessage()` reads `response.message` when the response
 *    is an object, so `error.message` stays the same string it was before. That
 *    is what keeps the suite's `rejects.toThrow('…')` assertions meaningful
 *    through this change rather than merely passing.
 *
 * The existing Nest exception classes are kept rather than replaced by one
 * `DomainException`, for the same two reasons: `instanceof BadRequestException`
 * is asserted directly by several specs, and the class name is what makes a
 * stack trace legible.
 *
 * Rejected alternative: an exception filter that attaches codes centrally. It
 * would need a status → code map, which is precisely the collapse these codes
 * exist to undo — one status, several meanings.
 */

const build = (
  statusCode: HttpStatus,
  code: ErrorCode,
  message: string,
): DomainErrorBody => ({ statusCode, code, message });

/** 400 — the request is understood and refused for a stated domain reason. */
export const badRequest = (code: ErrorCode, message: string) =>
  new BadRequestException(build(HttpStatus.BAD_REQUEST, code, message));

/** 401 — credentials, activation state, or a setup code. */
export const unauthorized = (code: ErrorCode, message: string) =>
  new UnauthorizedException(build(HttpStatus.UNAUTHORIZED, code, message));

/** 404 — including "exists but is not yours", which must be indistinguishable. */
export const notFound = (code: ErrorCode, message: string) =>
  new NotFoundException(build(HttpStatus.NOT_FOUND, code, message));

/** 409 — the request conflicts with the current state of the resource. */
export const conflict = (code: ErrorCode, message: string) =>
  new ConflictException(build(HttpStatus.CONFLICT, code, message));
