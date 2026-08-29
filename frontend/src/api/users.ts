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
