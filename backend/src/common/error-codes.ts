/**
 * The stable, machine-readable identifier every domain exception carries
 * alongside its message.
 *
 * Why this exists: an HTTP status is too coarse to drive a user-facing
 * sentence. `400` already means four different things on `POST /time-entries`
 * (an open shift exists, the shifts overlap, the time is in the future, the end
 * precedes the start), and a status-keyed map on the client collapses them into
 * one sentence that tells nobody what to fix. RFC 9457 says the same — the
 * status is advisory, the discriminator belongs in the body — and we take its
 * substance without its ceremony (no `type` URIs, no `application/problem+json`),
 * since this API has exactly one known client.
 *
 * The division of labour, which the frontend invariants in architecture.md
 * spell out: the `message` here is for tests, Swagger and logs. The sentence a
 * user reads lives in the client's own `messages.ts`, keyed off this code. The
 * two wordings are free to change independently — the code is the only thing
 * both sides agree on.
 *
 * ⚠️ The mapping to throw sites is deliberately **not** one-to-one. Two sites
 * that require the same sentence from the user share a code, and in one case
 * they must: an unknown email and a wrong password both answer
 * `INVALID_CREDENTIALS`, because giving them separate codes would hand the
 * client the means to enumerate accounts — the exact thing their shared message
 * exists to prevent. `EMAIL_ALREADY_EXISTS` and `OPEN_SHIFT_EXISTS` likewise
 * appear at several sites: they are the two-layer checks (explicit check plus
 * the DB constraint behind it), and which layer stopped the request is our
 * business, not the caller's.
 *
 * ⚠️ Not everything that answers 4xx carries a code. `ValidationPipe`'s own
 * 400s are framework-generated and have none — that is expected rather than a
 * gap, since those messages are never shown to a user, and the client treats a
 * missing code as an unmapped failure with a generic fallback. The three
 * deliberate `InternalServerErrorException`s have none either: they are not
 * part of the API contract, they name their own fix, and Swagger does not
 * declare them.
 *
 * Shape matches the Prisma-generated enums (a const object plus a union type)
 * so the idiom is the same one already in use for `Role`.
 */
export const ErrorCode = {
  // ── auth ────────────────────────────────────────────────────────────────
  /** Unknown email *or* wrong password — one code on purpose (see above). */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** `isActive === false`. Checked before the activation state, in both flows. */
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  /** `password === null` — the account exists but has never been activated. */
  ACCOUNT_NOT_ACTIVATED: 'ACCOUNT_NOT_ACTIVATED',
  /** Activation attempted on an account that already has a password. */
  ACCOUNT_ALREADY_ACTIVATED: 'ACCOUNT_ALREADY_ACTIVATED',
  /** The setup code does not match. Distinct from expiry: different fix. */
  INVALID_SETUP_CODE: 'INVALID_SETUP_CODE',
  /** The setup code has lapsed. The admin can issue a new one. */
  SETUP_CODE_EXPIRED: 'SETUP_CODE_EXPIRED',
  /**
   * `PATCH /auth/change-password` with a `currentPassword` that does not match.
   * A distinct code from `INVALID_CREDENTIALS` on purpose: the caller here is
   * already authenticated, so there is no account to enumerate — collapsing the
   * two would just make the message vaguer for no security benefit.
   *
   * ⚠️ Carried by a **400, not a 401** — changed in step 8f and not to be moved
   * back. `api/client.ts` logs the user out on any 401 that carried a token, by
   * a deliberate rule that keys off the Authorization header rather than a list
   * of endpoints. This route must send that header, so answering 401 here threw
   * the user out of the app for a typo and told them their session had expired.
   */
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  /**
   * `PATCH /auth/change-password` where `newPassword` equals `currentPassword`.
   * Kept apart from a ValidationPipe 400: the DTO cannot see across two fields,
   * and this needs a sentence of its own — "use at least 8 characters" would be
   * the wrong answer to a password that is already long enough.
   */
  NEW_PASSWORD_SAME_AS_CURRENT: 'NEW_PASSWORD_SAME_AS_CURRENT',

  // ── users ───────────────────────────────────────────────────────────────
  /** No user with this id/email, regardless of role. */
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  /**
   * No EMPLOYEE with this id. An ADMIN id lands here too, deliberately — admin
   * rows are out of reach of every employee-scoped route.
   */
  EMPLOYEE_NOT_FOUND: 'EMPLOYEE_NOT_FOUND',
  /** Both layers of the uniqueness rule answer with this one. */
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',

  // ── time entries ────────────────────────────────────────────────────────
  /** Clock-in, or a manual write by an employee whose shift is still open. */
  OPEN_SHIFT_EXISTS: 'OPEN_SHIFT_EXISTS',
  /** Clock-out with nothing to close. */
  NO_OPEN_SHIFT: 'NO_OPEN_SHIFT',
  /** An employee sent `userId` — they always write to themselves. */
  USER_ID_NOT_ALLOWED: 'USER_ID_NOT_ALLOWED',
  /** An admin omitted `userId` — they have no shifts of their own. */
  USER_ID_REQUIRED: 'USER_ID_REQUIRED',
  /** No such entry, or it belongs to someone else — one answer for both. */
  TIME_ENTRY_NOT_FOUND: 'TIME_ENTRY_NOT_FOUND',
  /** Two shifts of one person occupying the same time. */
  SHIFT_OVERLAP: 'SHIFT_OVERLAP',
  /**
   * An EMPLOYEE writing outside the current or previous cycle. Once a cycle is
   * paid its record stops moving. An ADMIN never sees this.
   */
  CYCLE_LOCKED: 'CYCLE_LOCKED',

  // ── settings / cycles ───────────────────────────────────────────────────
  /** A `?cycle=` value that is not `YYYY-MM` — usually a hand-edited URL. */
  INVALID_CYCLE: 'INVALID_CYCLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
