# syntax=docker/dockerfile:1
# node:*-alpine already ships libssl.so.3/libcrypto.so.3 (Node's own crypto
# module needs them), which is all the Prisma query engine binary requires too
# — no extra `apk add openssl` needed.
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# prisma/seed.ts runs at every start (see docker-entrypoint.sh) and imports this
# one pure helper from lib/. If seed.ts ever imports anything else from lib/, copy it here too.
COPY --from=builder /app/lib/orgCode.ts ./lib/orgCode.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# /app/data holds the SQLite file (DATABASE_URL should point here); mount it as a volume.
RUN chmod +x ./docker-entrypoint.sh \
    && mkdir -p /app/data \
    && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
