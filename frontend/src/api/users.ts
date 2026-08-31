import { request } from "./client"

/** Mirrors the backend's Prisma-generated `Role`. Hand-written here because the
 *  two projects have separate dependency trees — the same reasoning as the
 *  ErrorCode union in lib/messages.ts. */
export type Role = "ADMIN" | "EMPLOYEE"

/**
 * `UserProfileDto` — the user's view of **themselves**, returned by
 * `GET /users/me` and inside the login response.
 *
 * ⚠️ Deliberately not the same shape as the admin's view of other people
 * (`UserResponseDto`), which carries `setupCode` — the secret that unlocks an
 * unactivated account. The backend keeps them as two declarations rather than
 * one derived from the other, and so does this client.
 */
export interface UserProfile {
  id: number
  name: string
  email: string
  role: Role
  /** ISK per hour. Always null for an ADMIN, who never clocks in. */
  hourlyRate: number | null
}

export function getMe(): Promise<UserProfile> {
  return request<UserProfile>("/users/me")
}

// ── The admin's view of other people (step 13-3) ─────────────────────────────

/**
 * `UserResponseDto` — what an ADMIN sees of an EMPLOYEE, returned by every one
 * of the six Team endpoints, writes included.
 *
 * ⚠️ **Declared standalone, never derived from `UserProfile`.** That is the
 * client side of an existing backend invariant (architecture.md § Invariants):
 * subtractive derivation (`Omit<UserResponse, "setupCode">` and friends) leaks
 * by default, because a field added to the admin's shape would flow silently
 * into the self-facing one. Adding a field to either must be a deliberate act
 * of writing it there.
 */
export interface UserResponse {
  id: number
  name: string
  email: string
  role: Role
  /** ISK per hour. Non-null for every EMPLOYEE, and this list is EMPLOYEE-only. */
  hourlyRate: number | null
  /** `false` after a soft delete. The row and its shifts are never removed. */
  isActive: boolean
  /** Derived by the backend: `true` once they have set their own password. */
  hasActivated: boolean
  /**
   * The 4-digit code the admin hands over out of band, non-null only while an
   * employee is still pending.
   *
   * ⚠️ Non-null does **not** mean usable: `deactivate` writes only
   * `isActive: false` and leaves this untouched, while `POST /auth/set-initial-password`
   * checks `isActive` before it ever looks at the code. A deactivated employee
   * who never activated therefore holds a live code that cannot possibly work —
   * see `isPending()` below, which is what the UI keys off instead.
   */
  setupCode: string | null
  /** When the code above stops working. Set and cleared together with it. */
  setupCodeExpiresAt: string | null
}

/** What `POST /users` accepts. `hourlyRate` is `@IsInt() @Min(1)` on the DTO. */
export interface CreateEmployeeInput {
  name: string
  email: string
  hourlyRate: number
}

/**
 * What `PUT /users/:id` accepts — **`name` and `hourlyRate` only**.
 *
 * ⚠️ Email is create-only. The DTO is `PartialType(OmitType(CreateUserDto, ['email']))`,
 * so an email sent here is rejected by the global ValidationPipe rather than
 * ignored. `EmployeeForm` must not offer the field in edit mode at all: an
 * input whose value the API refuses is worse than no input.
 */
export interface UpdateEmployeeInput {
  name: string
  hourlyRate: number
}

/**
 * Whether this employee is waiting to activate — the state that shows a setup
 * code, its expiry, and the **New code** button.
 *
 * ⚠️ **`isActive` is half of the answer, and leaving it out is the bug.**
 * `!hasActivated` alone also matches a *deactivated* employee who never
 * activated, whose code cannot work (see `setupCode` above) and for whom
 * `POST /users/:id/reset-setup-code` would happily issue a second one just as
 * dead — the backend refuses only when the account is already activated. That
 * is precisely the "action guaranteed to fail" that makes `Reactivate` replace
 * `Deactivate` one column over.
 */
export function isPending(user: UserResponse): boolean {
  return user.isActive && !user.hasActivated
}

/**
 * Every EMPLOYEE, sorted by name, **including deactivated ones** — the client
 * decides how to show them. The admin never appears in their own team list.
 */
export function getEmployees(): Promise<UserResponse[]> {
  return request<UserResponse[]>("/users")
}

/**
 * Creates the row with no password and a 4-digit code valid for 3 days.
 *
 * The response is the only place that code can be read, which is why the page
 * opens a dialog with it rather than merely refetching: creating an account is
 * two actions, and handing the code over is the one the UI can otherwise hide.
 */
export function createEmployee(input: CreateEmployeeInput): Promise<UserResponse> {
  return request<UserResponse>("/users", { method: "POST", body: input })
}

export function updateEmployee(
  id: number,
  input: UpdateEmployeeInput,
): Promise<UserResponse> {
  return request<UserResponse>(`/users/${id}`, { method: "PUT", body: input })
}

/**
 * Soft delete — `isActive: false`, the row and its payroll history kept.
 *
 * ⚠️ Takes effect immediately: `JwtStrategy` re-checks `isActive` on every
 * request, so a token issued a second earlier stops working at once.
 */
export function deactivateEmployee(id: number): Promise<UserResponse> {
  return request<UserResponse>(`/users/${id}`, { method: "DELETE" })
}

/** The other side of the soft delete. Without it, `DELETE` is irreversible
 *  through the API: `PUT` takes neither field and a fresh `POST` collides with
 *  the unique email. */
export function reactivateEmployee(id: number): Promise<UserResponse> {
  return request<UserResponse>(`/users/${id}/reactivate`, { method: "PATCH" })
}

/**
 * Issues a fresh code and a fresh 3-day expiry for a pending employee.
 *
 * ⚠️ Returns the **full** employee, new code included — so nothing here needs a
 * follow-up read to display it. All four writes in this module do the same.
 */
export function resetSetupCode(id: number): Promise<UserResponse> {
  return request<UserResponse>(`/users/${id}/reset-setup-code`, { method: "POST" })
}
