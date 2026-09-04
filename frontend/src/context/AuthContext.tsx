import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import { login as apiLogin } from "@/api/auth"
import { ApiError, configureApiClient } from "@/api/client"
import { getMe, type UserProfile } from "@/api/users"
import type { ErrorCode } from "@/lib/messages"

/**
 * ⚠️ Only the token is persisted. The user object is never written to
 * localStorage: `role` decides which pages render and stored values are
 * editable by hand, so the app would draw admin pages for anyone who edits one
 * word in devtools. It also keeps the name fresh, and closes the one hole left
 * in "deactivation takes effect immediately" — which JwtStrategy already
 * enforces on every request.
 *
 * The cost is one request per **tab open**, not per navigation: this provider
 * mounts above the router.
 */
const TOKEN_KEY = "swifttrack.token"

// ── Wiring, done at import time ──────────────────────────────────────────────
//
// ⚠️ This deliberately does NOT live in an effect. React runs a child's effects
// **before** its parent's, and this provider is the parent of every page — so a
// page that fetches on its first commit would send its request before the client
// had been wired: no Authorization header, and therefore no auto-logout either,
// since the rule keys off whether a header was sent. Nothing here needs React
// state, so nothing here has to wait for React.

function readStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

let currentToken: string | null = readStoredToken()
let notifyUiOfSessionExpiry: (() => void) | null = null

function storeToken(token: string | null): void {
  currentToken = token
  if (token === null) {
    localStorage.removeItem(TOKEN_KEY)
  } else {
    localStorage.setItem(TOKEN_KEY, token)
  }
}

configureApiClient({
  getToken: () => currentToken,
  onSessionExpired: () => {
    // The token is dropped here rather than inside the React listener, so it
    // happens whether or not a provider is mounted to hear about it. Losing the
    // banner is cosmetic; keeping a dead token is not.
    storeToken(null)
    notifyUiOfSessionExpiry?.()
  },
})

interface AuthContextValue {
  user: UserProfile | null
  /** True until GET /users/me has answered. Nothing renders before then — not
   *  even a redirect to /login, which would flash the login page on every
   *  refresh of an authenticated session. */
  isBootstrapping: boolean
  /** Set only when the boot request got **no response**. The token is kept and
   *  the user is offered a retry — a network failure is not a logout. */
  bootstrapError: ErrorCode | null
  retryBootstrap: () => void
  /** Shown on /login so being thrown out reads as an explanation. */
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<void>
  /**
   * Swaps the stored token for a fresh one, without touching `user` — nothing
   * about the person changed, only their credential.
   *
   * Exists for `PATCH /auth/change-password`, which revokes every token this
   * user holds and hands back a replacement. Without this the caller's own
   * session would be dead the moment it succeeded, and the next request would
   * bounce them to /login claiming the session expired — the same failure this
   * step was created to remove, arriving one request later.
   */
  replaceToken: (token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // The token lives in a ref rather than state: nothing renders it, and a ref
  // is what lets api/client.ts read the *current* value through the callback
  // below without re-registering on every change.
  const [user, setUser] = useState<UserProfile | null>(null)
  // Derived from the stored token at mount rather than set from inside the
  // effect: with no token there is nothing to verify, and a setState in an
  // effect body costs an extra render pass on every boot.
  const [isBootstrapping, setIsBootstrapping] = useState(currentToken !== null)
  const [bootstrapError, setBootstrapError] = useState<ErrorCode | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Only the UI half is registered from React — the token was already cleared
  // by the time this runs.
  useEffect(() => {
    notifyUiOfSessionExpiry = () => {
      setUser(null)
      setSessionExpired(true)
    }
    return () => {
      notifyUiOfSessionExpiry = null
    }
  }, [])

  useEffect(() => {
    if (currentToken === null) return

    // The ignore flag also explains the doubled request React 19's StrictMode
    // makes in development.
    let ignore = false

    void (async () => {
      try {
        const me = await getMe()
        if (!ignore) setUser(me)
      } catch (error) {
        // A 401 has already cleared the session and /login explains itself, so
        // that one case needs nothing here.
        //
        // ⚠️ Everything else must surface. A 500 or a 403 answering this request
        // used to be swallowed, which dropped the user on /login with no
        // explanation and a still-valid token in storage — a silent failure
        // wearing the costume of a normal sign-out.
        const isUnauthorized = error instanceof ApiError && error.status === 401
        if (!ignore && !isUnauthorized) {
          setBootstrapError(
            error instanceof ApiError ? error.code : "UNKNOWN_ERROR",
          )
        }
      } finally {
        if (!ignore) setIsBootstrapping(false)
      }
    })()

    return () => {
      ignore = true
    }
  }, [attempt])

  const retryBootstrap = useCallback(() => {
    setBootstrapError(null)
    setIsBootstrapping(true)
    setAttempt((n) => n + 1)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    // Clear the expiry banner on the attempt itself, so a wrong password does
    // not render "your session expired" beside "invalid email or password".
    setSessionExpired(false)

    const response = await apiLogin(email, password)

    storeToken(response.accessToken)
    // The user comes from the login response — no follow-up GET /users/me.
    setUser(response.user)
  }, [])

  // No state to set: `user` is unchanged by a password change, and the token is
  // not rendered anywhere. Writing it through the same `storeToken` login uses
  // keeps localStorage and the module-level `currentToken` that api/client.ts
  // reads from ever disagreeing.
  const replaceToken = useCallback((token: string) => {
    storeToken(token)
  }, [])

  const logout = useCallback(() => {
    storeToken(null)
    setUser(null)
    setSessionExpired(false)
    // ⚠️ Also the escape hatch from the boot-error screen: without clearing
    // these, signing out while the backend is unreachable leaves the retry
    // screen up and the user with no way to reach /login at all.
    setBootstrapError(null)
    setIsBootstrapping(false)
  }, [])

  return (
    <AuthContext
      value={{
        user,
        isBootstrapping,
        bootstrapError,
        retryBootstrap,
        sessionExpired,
        login,
        replaceToken,
        logout,
      }}
    >
      {children}
    </AuthContext>
  )
}

// The hook belongs beside the provider it reads — architecture.md § Folder
// Structure lists one file for both. The cost is that editing this file
// remounts its subtree in development instead of hot-reloading it.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error("useAuth must be used inside <AuthProvider>")
  }
  return value
}
