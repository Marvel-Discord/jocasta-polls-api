Dockerizing jocasta-polls-api

Files added:
- `Dockerfile` - multi-stage build that compiles TypeScript and runs the compiled output.
- `docker-compose.yml` - runs app + redis (persistent volume).
- `.dockerignore` - excludes local artifacts and secrets from the build context.

How to build and run (local development):

1. Build & start with Compose (this will also start Redis):

```powershell
docker compose up --build
```

2. The API will be available at http://localhost:8000.

Notes about Redis placement
- Best practice: run Redis in a separate container (as included in `docker-compose.yml`).
- Even if this project is the only consumer of Redis, keeping Redis in a separate container provides clearer separation of concerns, easier upgrades, and persistent storage via Docker volumes.
- If you prefer an all-in-one single container, you can run Redis in the same container, but this complicates process management and is not recommended for production.

Environment variables
- The `docker-compose.yml` loads variables from your local `.env` file. For production deployments, provide a secure env source or a secrets manager and do not commit `.env` into version control.

Prisma
- The build runs `pnpm install` and `pnpm build` which triggers `prisma generate` via postinstall. Ensure the database (postgres) referenced by `DATABASE_URL` is reachable from inside the container (update host/credentials if needed).

Troubleshooting
- If prisma fails during image build because it can't connect to the database for introspection/migrations, consider running `prisma generate` on the host and/or set `DATABASE_URL` to a reachable DB during build. Alternatively move `prisma generate` into a container runtime step rather than install time.
