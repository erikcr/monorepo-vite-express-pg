FROM node:22-alpine AS base
RUN npm install -g pnpm@9.15.4

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
RUN pnpm install --frozen-lockfile --filter @repo/api-server...

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
RUN pnpm --filter @repo/api-server build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/artifacts/api-server/dist ./dist
COPY --from=build /app/lib/db/migrations ./migrations
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
