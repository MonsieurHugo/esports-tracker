# ============================================
# Backend Dockerfile - AdonisJS 6
# ============================================

# Base image
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Development
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=development
EXPOSE 3333
CMD ["node", "ace", "serve", "--watch"]

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node ace build

# Production
FROM base AS production
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 adonisjs
RUN adduser --system --uid 1001 adonisjs

WORKDIR /app

COPY --from=builder --chown=adonisjs:adonisjs /app/build ./
RUN pnpm install --prod --frozen-lockfile

USER adonisjs
EXPOSE 3333

CMD ["node", "bin/server.js"]
