# syntax=docker/dockerfile:1

# Bun runs both the build and the server. The embedded PGlite driver stays
# installed even though production uses PostgreSQL, so one image can run
# either engine.

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# `public/` is empty in the repository, so git-based builds may not have it.
# Bun can also abort while exiting an otherwise successful `next build`, which
# is why the build artefacts decide whether the build worked.
RUN mkdir -p public && { bun run build || true; } && test -f .next/BUILD_ID

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY next.config.ts tsconfig.json ./
# The server reads the migration files from disk, and shipping the rest of
# `lib/` keeps the database scripts runnable:
#   docker compose -f deploy/compose.yml run --rm app bun run db:migrate
COPY lib ./lib
USER bun
# The HTTP server, and nothing else: TLS and routing belong to the proxy in
# front of it.
EXPOSE 3000
CMD ["bun", "run", "start"]
