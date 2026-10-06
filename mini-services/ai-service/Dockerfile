# ─────────────────────────────────────────────────────────────────────────────
# GB Rent — AI microservice Dockerfile
#
# A standalone Bun/TypeScript service implementing:
#   - RandomForestRegressor for rental price prediction
#   - cosine-similarity k-NN for similar-listing matching
#
# No external dependencies (Bun has built-in everything), so the image is
# tiny. Uses alpine for the smallest possible footprint.
#
# Port 3003 (hardcoded in index.ts — do NOT use the PORT env var).
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1.3-alpine
WORKDIR /app

# Copy the service source. No dependencies to install (bun has built-in
# HTTP, no external npm packages needed).
COPY package.json ./
COPY . .

# Expose the AI service port. In Docker Compose this is only exposed to the
# web container via the internal network (not published to the host by
# default — uncomment the port mapping in docker-compose.yml to debug).
EXPOSE 3003

# Healthcheck — hits the /api/health endpoint every 30s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3003/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the AI service (no --hot in production).
CMD ["bun", "run", "start"]
