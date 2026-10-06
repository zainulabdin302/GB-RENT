# GB RENT: run with Docker

This version uses **Next.js, Prisma and SQLite**, plus a Bun AI service.
Compose runs two containers from **one shared `gb-rent:local` image**. SQLite
runs inside the web process; there is no PostgreSQL container in this version.

## First run

Docker Engine/Desktop with Compose is required. From the project folder:

1. Copy `.env.example` to `.env` if you do not already have a configured `.env`.
2. Generate a signing secret with `openssl rand -base64 32` and put it after
   `NEXTAUTH_SECRET=` in `.env`. The secret must have at least 32 characters.
3. Keep `NEXTAUTH_URL=http://localhost:3000` for local use. If you change
   `APP_PORT`, change the port in `NEXTAUTH_URL` too. On a server, use the
   actual public URL.
4. Run:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

Open http://localhost:3000. Subsequent starts use `docker compose up -d`.
Stop with `docker compose down`; this keeps the named data volumes.
**Do not add `-v` unless you intend to delete the database and uploaded photos.**

The image does not embed your database, personal uploads or environment files.
A fresh Docker volume starts empty. Your supplied `db/` and `public/uploads/`
files remain in the source archive, but are not automatically imported.

## First administrator / optional demo

With the web service running, create your own administrator:

```bash
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (at least 12 characters): ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose exec -e ADMIN_EMAIL -e ADMIN_PASSWORD web bun scripts/create-admin.ts
unset ADMIN_EMAIL ADMIN_PASSWORD
```

This creates a new account; it refuses to overwrite an existing email.

For a **local demo only**, set `SEED_ON_START=true` before the first start.
It creates four demo users and nine listings only when the database is empty.
Demo admin: `admin@gbrent.pk` / `admin123`; regular users:
`ali@gbrent.pk`, `sara@gbrent.pk`, `khan@gbrent.pk` / `user123`.
Do not use these known demo credentials on a public deployment. Disable demo
seeding for a real deployment and create your own administrator instead.
The old public `/api/seed` endpoint is disabled.

## Import your existing local SQLite data once

Use this only for a fresh Docker installation whose database volume is empty.
Stop the local development server first. Keep a backup of `db/` and
`public/uploads/` before starting. The example assumes `db/custom.db`; check
your original `DATABASE_URL` if the filename differs.

Create a consistent SQLite snapshot (Python 3 is needed for this one-time step):

```bash
mkdir -p docker-import
python3 - <<'PY'
import sqlite3
from pathlib import Path
source = Path('db/custom.db').resolve()
if not source.is_file():
    raise SystemExit('Database not found; check your original DATABASE_URL.')
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
    with sqlite3.connect('docker-import/custom.db') as dst:
        src.backup(dst)
PY
```

Build, stop any web container, then import into the named volumes. This refuses
to replace an existing non-empty Docker database:

```bash
docker compose build web
docker compose stop web
docker compose run --rm --no-deps --user root --entrypoint sh \
  -v "$PWD/docker-import:/import-db:ro" \
  -v "$PWD/public/uploads:/import-uploads:ro" web -ec '
    if [ -s /app/db/custom.db ]; then
      echo "Docker database already exists; import cancelled." >&2
      exit 1
    fi
    cp /import-db/custom.db /app/db/custom.db
    cp -R /import-uploads/. /app/public/uploads/
    chown -R node:node /app/db /app/public/uploads
  '
docker compose up -d
```

Existing volumes created by the previous root-running image may need their
ownership corrected once while the web service is stopped:

```bash
docker compose stop web
docker compose run --rm --no-deps --user root --entrypoint sh web -c \
  'chown -R node:node /app/db /app/public/uploads'
docker compose up -d
```

## Startup and data safety

- The entrypoint safely creates a missing SQLite file, applies compatible
  schema changes, and stops on errors or changes that would lose data.
- It never uses `--accept-data-loss` or deletes records.
- Database and uploads persist in named volumes. Volumes are not backups;
  keep separate backups before upgrades and database changes.
- The web container runs as a non-root user and starts `/app/server.js`.
- Uploaded images are validated and converted to WebP, with a 10 MB limit.
  They are served through an API so new uploads work after production builds.
- The AI container uses the same image but bypasses the database entrypoint.
  It is reachable only inside the Compose network on port 3003.

## Local development and verification

Install Node.js 22 and Bun 1.3.12. Configure `.env` from the template first.
The local database path is resolved relative to `prisma/schema.prisma`:
`file:../db/custom.db` points to the project's `db/custom.db`.

```bash
bun install --frozen-lockfile
bun run db:generate
bun run db:push
bun run dev
```

In another terminal:

```bash
bun mini-services/ai-service/index.ts
```

Checks:

```bash
bun run typecheck
bun run lint
bun run build
bun run test:smoke
```

The smoke test creates a temporary database and upload directory, starts the
production server on port 3197 and AI on port 3003, exercises the main APIs,
and cleans up afterward. Those ports must be free. It never uses your
project database. `bun run start` runs the production build locally.

The AI pricing model is trained on synthetic demo data. Its price estimates
are illustrative and have not been validated against real rental transactions.

## Verification limits

The production build, type checking, lint, and API smoke tests were run during
this review. The review environment has no Docker daemon, so the actual Docker
image build and Compose startup still need to be checked on your computer.
