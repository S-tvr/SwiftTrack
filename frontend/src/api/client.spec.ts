import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest"

import { ApiError, configureApiClient, request } from "./client"

// ⚠️ `fetch` is mocked, never `request()` itself. Mocking the wrapper under test
// proves only that the mock behaves as written, and hides exactly the bugs worth
// catching: a wrong header, a malformed URL, a mishandled status
// (architecture.md § Stack Traps #4).

const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function sentHeaders(): Record<string, string> {
  return fetchMock.mock.calls[0][1].headers as Record<string, string>
}

let onSessionExpired: Mock<() => void>

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  onSessionExpired = vi.fn<() => void>()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function withToken(token: string | null) {
  configureApiClient({
    getToken: () => token,
    onSessionExpired: () => onSessionExpired(),
  })
}

describe("the request URL and headers", () => {
  it("builds the URL from VITE_API_URL", async () => {
    withToken(null)
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1 }))

    await request("/users/me")

    // The value is pinned in vite.config.ts and is deliberately not the real
    // dev URL — so this passing means it came from the environment.
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/users/me")
  })

  it("attaches the bearer token when one exists", async () => {
    withToken("token-abc")
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await request("/users/me")

    expect(sentHeaders().Authorization).toBe("Bearer token-abc")
  })

  it("sends no Authorization header when auth is off", async () => {
    withToken("token-abc")
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await request("/auth/login", { method: "POST", body: {}, auth: false })

    expect(sentHeaders().Authorization).toBeUndefined()
  })

  it("sets Content-Type only when there is a body", async () => {
    withToken(null)
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await request("/users/me")
    expect(sentHeaders()["Content-Type"]).toBeUndefined()
  })
})

describe("the auto-logout rule", () => {
  it("logs out on a 401 for a request that carried a token", async () => {
    withToken("token-abc")
    fetchMock.mockResolvedValue(jsonResponse(401, { code: "USER_NOT_FOUND" }))

    await expect(request("/users/me")).rejects.toBeInstanceOf(ApiError)

    expect(onSessionExpired).toHaveBeenCalledOnce()
  })

  it("does NOT log out on a 401 from a request that sent no token", async () => {
    // This is the login form answering "wrong password". Clearing the session
    // here would wipe the form before the user could read why it failed.
    withToken("token-abc")
    fetchMock.mockResolvedValue(
      jsonResponse(401, { code: "INVALID_CREDENTIALS" }),
    )

    await expect(
      request("/auth/login", { method: "POST", body: {}, auth: false }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })

    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it("does NOT log out on a 401 when there is no token to send", async () => {
    withToken(null)
    fetchMock.mockResolvedValue(jsonResponse(401, { code: "USER_NOT_FOUND" }))

    await expect(request("/users/me")).rejects.toBeInstanceOf(ApiError)

    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it("does NOT log out when there is no response at all", async () => {
    // ⚠️ A network failure is not a 401. No response means no logout — keep the
    // token, show the error, offer a retry.
    withToken("token-abc")
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))

    await expect(request("/users/me")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    })

    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it("rethrows a non-transport error instead of blaming the network", async () => {
    // ⚠️ A bug in this client must not arrive dressed as "check your
    // connection" — that sends the next person looking at the wrong layer.
    withToken("token-abc")
    fetchMock.mockRejectedValue(new RangeError("a bug in our own code"))

    await expect(request("/users/me")).rejects.toBeInstanceOf(RangeError)

    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it("treats an AbortSignal timeout as a network failure", async () => {
    withToken("token-abc")
    fetchMock.mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError"),
    )

    await expect(request("/users/me")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    })
  })

  it("does NOT log out on a 403", async () => {
    withToken("token-abc")
    fetchMock.mockResolvedValue(jsonResponse(403, {}))

    await expect(request("/users")).rejects.toMatchObject({ status: 403 })

    expect(onSessionExpired).not.toHaveBeenCalled()
  })
})

describe("the error code", () => {
  beforeEach(() => withToken("token-abc"))

  it("carries the backend's code through", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { code: "SHIFT_OVERLAP" }))

    await expect(request("/time-entries")).rejects.toMatchObject({
      status: 400,
      code: "SHIFT_OVERLAP",
    })
  })

  it("answers RATE_LIMITED on a 429, whose body carries no code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { message: "ThrottlerException: Too many requests" }),
    )

    await expect(request("/auth/login")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    })
  })

  it("degrades a codeless 400 to UNKNOWN_ERROR", async () => {
    // The ValidationPipe's own 400s are framework-generated and carry no code.
    fetchMock.mockResolvedValue(
      jsonResponse(400, { message: ["email must be an email"] }),
    )

    await expect(request("/users")).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
    })
  })

  it("degrades a code this client does not know", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { code: "SOMETHING_ADDED_LATER" }),
    )

    await expect(request("/users")).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
    })
  })

  it("survives an error response with no body at all", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }))

    await expect(request("/users")).rejects.toMatchObject({
      status: 500,
      code: "UNKNOWN_ERROR",
    })
  })
})

describe("empty successful responses", () => {
  beforeEach(() => withToken("token-abc"))

  it("does not try to parse a 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(request("/time-entries/1")).resolves.toBeUndefined()
  })

  it("does not try to parse a 200 with an empty body", async () => {
    // POST /auth/set-initial-password returns Promise<void> with @HttpCode(200),
    // so this is the shape of its success answer.
    fetchMock.mockResolvedValue(
      new Response(null, { status: 200, headers: { "content-length": "0" } }),
    )

    await expect(request("/auth/set-initial-password")).resolves.toBeUndefined()
  })

  it("handles an empty body with NO content-length header", async () => {
    // ⚠️ The reason the wrapper reads the body instead of trusting the header:
    // under chunked encoding there is no content-length, and this is the exact
    // response whose normal answer is "nothing". Getting it wrong tells a user
    // their activation failed when it succeeded.
    fetchMock.mockResolvedValue(new Response("", { status: 200 }))

    await expect(request("/auth/set-initial-password")).resolves.toBeUndefined()
  })

  it("still throws on a non-empty body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 200 }))

    await expect(request("/users/me")).rejects.toThrow()
  })
})
