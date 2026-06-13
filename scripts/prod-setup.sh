#!/usr/bin/env bash
# One-command production bootstrap for ConflictWatch.
#
# Run this ONCE against a fresh production database (and again after any new
# migration). It is idempotent. Requires DATABASE_URL to point at the
# production Postgres — everything else is optional and degrades to honest
# placeholders.
#
#   DATABASE_URL="postgres://..." ./scripts/prod-setup.sh
#
# What it does:
#   1. Installs workspace dependencies
#   2. Generates the Prisma client (incl. the Linux runtime binary)
#   3. Applies all migrations to the production DB (prisma migrate deploy)
#   4. Seeds the curated exposure graph (idempotent upserts)
#
# It does NOT start the worker or the web server — those are started by the
# hosting platforms (Railway / Vercel). See DEPLOYMENT.md.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Point it at the production database." >&2
  exit 1
fi

echo "==> [1/4] Installing dependencies"
pnpm install --frozen-lockfile

echo "==> [2/4] Generating Prisma client"
pnpm --filter @conflictwatch/db generate

echo "==> [3/4] Applying database migrations (migrate deploy)"
pnpm --filter @conflictwatch/db migrate:deploy

echo "==> [4/4] Seeding curated exposure graph"
pnpm --filter worker exec tsx ../../packages/db/seed-exposures.ts

echo ""
echo "✓ Production database is ready."
echo "  Next: deploy apps/web to Vercel and apps/worker to Railway."
echo "  The site renders immediately; conflict data appears once the worker"
echo "  has run an ingestion cycle (requires ANTHROPIC_API_KEY with credits)."
