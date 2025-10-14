FROM node:22-alpine

# Enable Corepack and pnpm
RUN corepack enable \
    && corepack prepare pnpm@10.13.1 --activate

WORKDIR /usr/src/app

# Copy everything including prisma folder
COPY . .

# Install dependencies (runs postinstall -> prisma generate)
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 8000

# Start your app
CMD ["pnpm", "start"]
