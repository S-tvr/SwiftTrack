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
    // `node`, not jsdom — jsdom is deliberately not installed. The specs here
    // are pure functions and a mocked `fetch` (which Node provides natively),
    // so none of them needs a DOM. The decision is revisited by the first step
    // that genuinely requires one.
    environment: 'node',
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
