// The single fetch wrapper. No component or page ever calls `fetch` directly
// (architecture.md § Frontend invariants).

import { toErrorCode, type ErrorCode } from "@/lib/messages"

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy frontend/.env.example to frontend/.env and restart the dev server.`,
    )
  }
  return value
}

// Deliberately no fallback to http://localhost:3000. Vite exposes only
// VITE_-prefixed variables, so a misspelt name resolves to undefined — and a
// default equal to the real dev value would make that work locally and surface
// only at deploy. That is the step 1 lesson (a fallback identical to the value
// under test proves nothing) applied on the frontend.
const BASE_URL = requireEnv(import.meta.env.VITE_API_URL, "VITE_API_URL")

// Checked at load, so a malformed value says so plainly instead of surfacing
// later as a "check your connection" error that sends the next person looking
// at the network layer.
try {
  new URL(BASE_URL)
} catch {
  throw new Error(`VITE_API_URL is not a valid URL: "${BASE_URL}"`)
}

/** Ceiling on a single request. AbortSignal.timeout needs no manual
 *  AbortController plumbing and fires a TimeoutError the catch below treats as
 *  what it is: no response. */
const TIMEOUT_MS = 15_000

/**
 * A failed request, carrying the two things a caller may act on: the status and
 * a `code` that always has text in messages.ts.
 *
 * ⚠️ The backend's `message` is deliberately **not** read. It exists for tests,
 * Swagger and logs; the sentence a user sees comes from the client.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode

  constructor(status: number, code: ErrorCode) {
    // The code, not a sentence: this string reaches logs and stack traces, and
    // the user-facing text is looked up from the code anyway.
    super(code)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

// ── Wiring from the React side ───────────────────────────────────────────────

// This module is not a component and cannot call hooks, so the two things it
// needs from the app are handed in once. AuthContext registers them on mount;
// a test registers fakes. Nothing here touches `localStorage` or `window`.

let getToken: () => string | null = () => null
let onSessionExpired: () => void = () => {}

export function configureApiClient(options: {
  getToken: () => string | null
  onSessionExpired: () => void
}): void {
  getToken = options.getToken
  onSessionExpired = options.onSessionExpired
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  /**
   * Whether to attach the bearer token. `false` on the two /auth routes, which
   * must not carry one: a 401 there means "wrong credentials" and belongs in
   * the form, and sending a stale token would turn a typo into a logout that
   * wipes the form before the user could read why it failed.
   */
  auth?: boolean
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options

  const token = auth ? getToken() : null
  const sentAuthHeader = token !== null

  const headers: Record<string, string> = {}
  if (sentAuthHeader) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (caught) {
    // No response at all — a dropped connection, a refused port, or our own
    // timeout. ⚠️ This is not a 401: the token stays, the user retries.
    //
    // ⚠️ Only genuine transport failures are relabelled. Anything else thrown
    // here is a bug in this client, and dressing it as "check your connection"
    // would point the next person at the wrong layer entirely.
    const isTransportFailure =
      caught instanceof TypeError ||
      (caught instanceof DOMException && caught.name === "TimeoutError")

    if (!isTransportFailure) throw caught
    throw new ApiError(0, "NETWORK_ERROR")
  }

  if (response.ok) {
    // ⚠️ Read the body, then decide — rather than asking whether
    // `content-length: 0` is present. Several success answers here carry no
    // body at all (`POST /auth/set-initial-password` and `DELETE
    // /time-entries/:id` both return `Promise<void>`), and calling res.json()
    // on those throws on precisely the responses whose normal answer is
    // "nothing". Keying off the header would make that depend on whether the
    // server chose chunked encoding — and the failure it produces is the worst
    // kind: the activation **succeeded**, and the user is told it failed.
    //
    // A non-empty body that is not valid JSON still throws, which is right.
    const text = await response.text()
    return (text === "" ? undefined : JSON.parse(text)) as T
  }

  // ⚠️ The discriminator is whether we sent an Authorization header — never a
  // list of endpoints someone must remember to update. A 401 on a request that
  // carried a token means the session is dead (expired, or the account was
  // deactivated, which JwtStrategy re-checks per request).
  if (response.status === 401 && sentAuthHeader) {
    onSessionExpired()
  }

  throw new ApiError(response.status, await readErrorCode(response))
}

async function readErrorCode(response: Response): Promise<ErrorCode> {
  // The throttler's 429 body carries no code and its wording
  // ("ThrottlerException: Too many requests") is never shown to a user.
  if (response.status === 429) return "RATE_LIMITED"

  try {
    const body: unknown = await response.json()
    if (typeof body === "object" && body !== null && "code" in body) {
      return toErrorCode((body as { code: unknown }).code)
    }
  } catch {
    // Empty or non-JSON error body — nothing to key off.
  }

  // Reached by the ValidationPipe's own 400s, which are framework-generated and
  // codeless by design. Expected rather than a gap: those messages are never
  // shown, and step 11's zod schemas catch the same rules before a request goes.
  return "UNKNOWN_ERROR"
}
