import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `defineConfig` comes from vitest/config rather than vite so the `test` block
// below is typed. It is the same Vite config otherwise.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // `node` remains the default: most specs here are pure functions and a
    // mocked `fetch` (which Node provides natively). jsdom was installed in
    // step 10 and is opted into **per file**, with a `// @vitest-environment
    // jsdom` control comment at the top — so the specs that do not need a DOM
    // never pay for one.
    environment: 'node',
    // ⚠️ Not a preference — a measured fix. Booting jsdom costs ~9s of
    // environment setup here, and with the default parallel forks the two DOM
    // specs never started at all: both died with "[vitest-pool]: Failed to
    // start forks worker … Timeout waiting for worker to respond", while the
    // two node specs passed — a green-looking run that had silently skipped
    // the new files. Vitest exposes no timeout for that particular wait, so
    // the lever is the contention itself. Sequential is also **faster** here:
    // 16s for the whole suite against the 60s the parallel run burned before
    // failing.
    fileParallelism: false,
    // ⚠️ Pinned here rather than read from `.env`, for two reasons: the specs
    // must run on a clean clone that has no `.env`, and a value distinct from
    // the real one is what lets client.spec.ts prove the base URL is built from
    // the environment instead of from a default hiding somewhere.
    env: {
      VITE_API_URL: 'http://api.test',
      // ⚠️ Load-bearing, not cosmetic. On a UTC machine the datetime specs pass
      // whatever the implementation does — `new Date(v).toISOString()` and
      // appending "Z" agree there, and a formatter without `timeZone: "UTC"`
      // agrees too. Newfoundland is chosen for being **negative** (which is what
      // makes a bare YYYY-MM-DD print as the previous day) and **not a whole
      // hour** (-3:30, the case `offset / 60` gets wrong).
      TZ: 'America/St_Johns',
    },
  },
})
