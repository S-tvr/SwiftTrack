import { Navigate, Outlet } from "react-router-dom"

import type { Role } from "@/api/users"
import { useAuth } from "@/context/AuthContext"

/**
 * Where each role belongs when it has no business being where it is. An admin
 * has no shifts and no hourlyRate; an employee has no team to manage.
 */
function homeFor(role: Role): string {
  return role === "ADMIN" ? "/team" : "/clock"
}

/**
 * The route table from build-plan § Routes and roles, enforced rather than
 * inferred:
 *
 *   /login, /activate                      public
 *   /clock, /shifts, /payroll              EMPLOYEE  (they call the /me routes)
 *   /shifts/:userId, /payroll/:userId      ADMIN
 *   /team, /payroll-overview, /settings    ADMIN
 *   /change-password                       both roles — omit `allow`
 *
 * The server is the real defence and already holds it — this keeps the UI from
 * disagreeing with it, and is written out because generated authorization
 * defaults to permissive.
 *
 * ⚠️ A wrong-role visit redirects to that role's own home, never a blank screen.
 *
 * ⚠️ `allow` is **optional**, and omitting it means "signed in, either role" —
 * never "no check at all". The sign-in check above always runs. It became
 * optional in step 13-4 for `/change-password`, the first route both roles
 * reach, matching the two endpoints that were already role-free for the same
 * reason (`GET /users/me`, `GET /settings`).
 */
export function ProtectedRoute({ allow }: { allow?: Role }) {
  const { user } = useAuth()

  if (user === null) return <Navigate to="/login" replace />
  if (allow !== undefined && user.role !== allow) {
    return <Navigate to={homeFor(user.role)} replace />
  }

  return <Outlet />
}

/** The `/` index route: sends each role to the page it actually starts on. */
export function HomeRedirect() {
  const { user } = useAuth()

  if (user === null) return <Navigate to="/login" replace />
  return <Navigate to={homeFor(user.role)} replace />
}
