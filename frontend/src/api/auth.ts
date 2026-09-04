import { request } from "./client"
import type { UserProfile } from "./users"

export interface LoginResponse {
  accessToken: string
  /** Returned alongside the token so the client needs no follow-up
   *  GET /users/me just to render the header. */
  user: UserProfile
}

export interface SetInitialPasswordInput {
  email: string
  /** Exactly 4 digits, handed to the employee by the admin out of band. */
  setupCode: string
  newPassword: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface ChangePasswordResponse {
  /**
   * The change revoked every token issued before it — including the one that
   * made the request — so this must replace the stored token or the next call
   * 401s and logs the user out.
   */
  accessToken: string
}

// ⚠️ The first two routes pass `auth: false`. A 401 there means "wrong
// credentials" and belongs in the form — sending a stale token would let a typo
// trigger the auto-logout and wipe the form before the user could read why it
// failed.
//
// ⚠️ `changePassword` below **cannot** do that: it acts on the caller's own row,
// identified by the token, so the header is mandatory. That is precisely why the
// backend answers a wrong `currentPassword` with **400 rather than 401** — the
// two facts are one decision, made in step 8f, and neither side can be flipped
// on its own without reintroducing the bug: a typo would wipe the session and
// blame an expired one.

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  })
}

/** Answers 200 with an empty body on success. */
export function setInitialPassword(
  input: SetInitialPasswordInput,
): Promise<void> {
  return request<void>("/auth/set-initial-password", {
    method: "POST",
    body: input,
    auth: false,
  })
}

/**
 * Changes the caller's own password. The row acted on comes from the token, so
 * there is no `userId` to pass — and the backend rejects one if sent.
 *
 * The returned token is not optional bookkeeping: every other session for this
 * user is now dead, and so is the one that made this call. Whoever calls this
 * must hand the token to `AuthContext.replaceToken` before the next request.
 */
export function changePassword(
  input: ChangePasswordInput,
): Promise<ChangePasswordResponse> {
  return request<ChangePasswordResponse>("/auth/change-password", {
    method: "PATCH",
    body: input,
  })
}
