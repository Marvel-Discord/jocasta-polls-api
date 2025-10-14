# -------------------
# Builder stage
# -------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy everything
COPY . .

# Install all dependencies (dev + prod)
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
RUN pnpm install --frozen-lockfile

# Generate Prisma client & build TypeScript
RUN pnpm prisma generate
RUN pnpm build

# -------------------
# Runtime stage
# -------------------
FROM node:22-alpine

WORKDIR /app

# Copy only package files
COPY package.json pnpm-lock.yaml ./

# Install only prod dependencies, ignore scripts
RUN npm_config_ignore_scripts=true corepack enable && corepack prepare pnpm@10.13.1 --activate
RUN npm_config_ignore_scripts=true pnpm install --frozen-lockfile --prod

# Copy built app from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Copy only generated Prisma client
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client

ENV NODE_ENV=production
EXPOSE 8000

CMD ["node", "dist/index.js"]
