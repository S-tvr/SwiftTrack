# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
# bookworm-slim rather than alpine: bcrypt@6 is a native addon (node-gyp-build)
# that ships prebuilt binaries for glibc only. On musl it falls through to a
# source build, which would need build-base and python3 in the image.
FROM node:22-bookworm-slim AS build

WORKDIR /app

# prisma.config.ts and prisma/ are copied before `npm ci` because the
# postinstall hook runs `prisma generate`, which reads both. src/generated/ is
# gitignored, so without this the TypeScript build cannot resolve the client.
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# nest build. Note the output is dist/src/main.js, not dist/main.js —
# prisma.config.ts and prisma/*.ts sit outside src/ and pull the inferred
# TypeScript root down one level. package.json's start:prod already reflects it.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# devDependencies are kept deliberately. `prisma db seed` runs
# `tsx prisma/seed.ts` (see prisma.config.ts), so the prisma CLI and tsx are
# both needed at runtime — an --omit=dev image could not run its own migrations.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/package.json ./

# src/ costs ~60 small files and makes `docker compose exec backend npm test`
# work out of the box (jest and ts-jest are already present per the note above).
# tsconfig.json goes with it: ts-jest reads it for experimentalDecorators, and
# without it every Nest/Swagger decorator fails to compile with TS1240.
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
