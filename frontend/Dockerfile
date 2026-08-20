FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
# Not `npm ci`: the lockfile is maintained on Windows/host machines and
# doesn't pin the musl/Alpine-specific optional native bindings (sharp,
# Tailwind's oxide engine) that this platform needs — npm ci fails on that
# mismatch. `npm install` resolves them for the current platform instead.
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at runtime — must be supplied as a build arg, not just an env var.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
