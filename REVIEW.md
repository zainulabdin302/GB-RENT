# GB RENT code review and fixes

Reviewed 6 October 2026. Scope: supplied source, production build, key API
workflows, and Docker startup configuration. This is a targeted review, not a
guarantee that every possible UI or deployment issue has been found.

## Fixed

1. **Docker startup path:** the image copied standalone output to `/app`, but
   tried to execute `.next/standalone/server.js`. It now runs `/app/server.js`.
   Both web and AI services can use one shared image.
2. **Missing photo-upload API:** added authenticated upload handling, actual
   image decoding, size/pixel limits, generated filenames, and WebP conversion.
3. **Production photo retrieval:** `/uploads/...` is served through a dynamic
   file endpoint, so uploads made after a production build remain accessible.
4. **Destructive public seeding:** disabled the unauthenticated HTTP seed route.
   Demo seeding is now an explicit local script, transactional, and refuses to
   reseed a database containing users or listings. Existing seed images are
   preserved instead of overwritten by transparent placeholders.
5. **Unsafe startup database changes:** removed automatic acceptance of data
   loss and the code that ignored Prisma failures. Startup stops on errors.
6. **First-run SQLite failure:** reproduced an empty Prisma schema-engine error
   for an absent SQLite file. Startup now creates the file in append mode
   before schema synchronization, without truncating existing databases.
7. **Favorites visibility bypass:** non-owners could favorite a private listing
   and retrieve it through favorites. Creation and retrieval now apply the
   listing visibility rules, including when an approved listing becomes pending.
8. **Invalid numbers and partial edits:** fractional room counts and sizes are
   rejected, integer ranges are checked, and image/scalar listing updates are
   atomic. Image URLs are restricted to local uploaded-photo paths (1–10).
9. **Hidden TypeScript errors:** removed `ignoreBuildErrors`; excluded unrelated
   websocket examples and included Bun types for the AI service.
10. **Network-dependent font build failure:** replaced build-time Google Fonts
    downloads with locally bundled Geist fonts, preserving the font family.
11. **Configuration and runtime behavior:** removed predictable auth-secret
    fallback, required a configured Docker secret, added health checks, bounded
    AI request timeouts, removed query logging, and added a local admin-creation
    script. Registration rejects passwords exceeding bcrypt's 72-byte limit.

## Verified

- Frozen dependency installation.
- TypeScript checking and ESLint.
- Next.js production build, including a build without database/auth environment
  variables supplied (matching the Docker build context).
- Smoke tests against the production server with a disposable database:
  seeding protection; public browsing; registration and login; unauthorized and
  non-admin access; image upload/retrieval; fake-image rejection; listing
  creation/editing/approval; integer validation; private-listing protection;
  favorites; inquiry delivery/read status; AI prediction/similar listings;
  persistence after a server restart; and cascade deletion.
- Compose YAML structure and shell entrypoint syntax.

The uploaded database and photos were not used for smoke tests and remain
unchanged in the delivered source. Build outputs, installed dependencies,
Git history, and generated test data are not included in the archive.
The environment file is replaced by `.env.example`; configure your own `.env`.

## Still to check on your computer

Docker is not available in the review environment, so an actual image build,
Compose startup, volume ownership, and import of your existing data remain
unverified. Follow `DOCKER.md`. A fresh Docker volume is empty; existing local
records must be imported using the documented backup/import procedure.
Browser click-through, Azure deployment, load testing, and a full security audit
were outside this review. Before public hosting, configure HTTPS, backups, and
request/login rate limits. This source uses SQLite and a synthetic-data AI model;
it has not been migrated to PostgreSQL or trained on real market transactions.

Reference documentation used:
- https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- https://docs.prisma.io/docs/orm/v6/prisma-migrate/workflows/prototyping-your-schema
