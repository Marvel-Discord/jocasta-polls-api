# -------------------
# Builder stage
# -------------------
FROM node:22-alpine AS builder

WORKDIR /app

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

COPY package.json pnpm-lock.yaml ./

# Install only prod dependencies
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
RUN pnpm install --frozen-lockfile --prod

# Copy built code and Prisma client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

ENV NODE_ENV=production
EXPOSE 8000

# Run compiled JS instead of tsx
CMD ["node", "dist/index.js"]
