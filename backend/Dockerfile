FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS runner

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# Create uploads directory and give ownership to the app user
RUN mkdir -p /app/uploads && \
    chown -R nodejs:nodejs /app/uploads

USER nodejs

EXPOSE 5000

CMD ["node", "src/server.js"]