# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

# A full install, not --omit=dev: vite.config.ts imports defineConfig from
# 'vitest/config', so pruning devDependencies makes the config itself
# unloadable and the build fails before it compiles anything.
COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* variables at BUILD time — a runtime `environment:` entry in
# compose would do nothing. src/api/client.ts throws at module load when this is
# missing, on purpose, so the value must be supplied here.
#
# It is resolved by the visitor's browser, not from inside the container, so it
# has to be a host-reachable URL. A compose service name (http://backend:3000)
# would not resolve.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage — static files only, no Node
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
