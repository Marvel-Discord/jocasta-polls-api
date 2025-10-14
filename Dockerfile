# Multi-stage Dockerfile for jocasta-polls-api
FROM node:22-bullseye-slim AS builder
WORKDIR /app

# Enable corepack and ensure pnpm is available
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lockfile and package manifest first for efficient caching
COPY package.json pnpm-lock.yaml /app/

# Copy the rest of the source
COPY . .

# Install dependencies (will run `postinstall` which triggers `prisma generate`)
RUN pnpm install --frozen-lockfile

# Build TypeScript to `dist`
RUN pnpm build

### Runtime image
FROM node:22-bullseye-slim AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package.json so Node knows this is ESM (type: module)
COPY package.json .

# Copy only the production files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 8000

# Run the compiled JS entry
CMD ["node", "dist/index.js"]
