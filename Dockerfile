FROM node:22-alpine AS base
RUN npm install -g pnpm@9.15.4
WORKDIR /app

# Install deps
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/
COPY lib/env/package.json ./lib/env/
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build libs
FROM deps AS builder
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server
COPY tsconfig.json ./
RUN pnpm --filter @repo/db build
RUN pnpm --filter @repo/env build
RUN pnpm --filter @repo/api-server build

# Runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY scripts/migrate-and-start.sh ./migrate-and-start.sh
RUN chmod +x ./migrate-and-start.sh
CMD ["./migrate-and-start.sh"]
