/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend. Required — api/client.ts refuses to load without
   *  it rather than defaulting to localhost. Declared as possibly undefined
   *  because that is the truth at runtime: Vite inlines whatever `.env` held at
   *  build time, and nothing guarantees the key was there. */
  readonly VITE_API_URL: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
