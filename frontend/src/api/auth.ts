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

// ⚠️ Both routes pass `auth: false`. A 401 here means "wrong credentials" and
// belongs in the form — sending a stale token would let a typo trigger the
// auto-logout and wipe the form before the user could read why it failed.

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
