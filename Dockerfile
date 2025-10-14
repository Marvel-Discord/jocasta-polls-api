FROM node:22-alpine

# Use Corepack to activate the pnpm version pinned in package.json (packageManager)
RUN corepack enable \
	&& corepack prepare pnpm@10.13.1 --activate

WORKDIR /usr/src/app

COPY . .

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production

# Default port used in config (can be overridden with -e PORT)
EXPOSE 8000

# Run the start script (package.json start uses tsx)
CMD ["pnpm", "start"]
