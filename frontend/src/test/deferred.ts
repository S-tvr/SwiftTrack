/**
 * A promise whose resolution the test controls.
 *
 * Test-only, and never imported by application code — the one thing that cannot
 * be expressed with `mockResolvedValue` is *two requests in flight at once*,
 * which is what the assertions that matter most here need: an older response
 * landing after a newer one, and the window between a write answering and the
 * refetch behind it settling. Both are states the component really passes
 * through and a resolved mock skips straight over.
 */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
