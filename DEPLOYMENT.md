# ConflictWatch — Production Deployment

## Architecture

```
                    ┌─────────────────────────────┐
   Browser ───────▶ │  Vercel  (apps/web)         │  Next.js 16, API routes,
                    │  Edge CDN + serverless fns   │  static assets, globe
                    └──────────────┬──────────────┘
                                   │ SQL (pooled)
                    ┌──────────────▼──────────────┐
                    │  Postgres  (Neon / Supabase) │  12 migrations, indexed
                    └──────────────▲──────────────┘
                                   │ SQL (direct)
                    ┌──────────────┴──────────────┐
   GDELT, Anthropic │  Railway  (apps/worker)      │  node-cron ingestion,
   ◀──────────────▶ │  always-on container         │  classify, escalation,
                    └─────────────────────────────┘  assessments, alerts
```

- **apps/web** → **Vercel**. Serverless; reads the DB and proxies live feeds
  (USGS, GDACS, WHO, OpenSky). The worker is NOT here.
- **apps/worker** → **Railway** (or Render/Fly). A long-running `node-cron`
  process — it cannot run on Vercel. Restart-on-failure is load-bearing: the
  worker deliberately `exit(1)`s when a cycle hangs or crashes so the platform
  restarts it clean (see `railway.json`).
- **packages/db** → **Postgres**. Use a **pooled** connection string for the
  web app (Neon/Supabase pooler) — serverless functions exhaust direct
  connections. The worker uses the direct (unpooled) string.

## Required vs optional environment variables

| Variable | Where | Required | Without it |
|---|---|---|---|
| `DATABASE_URL` | web + worker | **Yes** | App won't boot (env validation throws) |
| `ANTHROPIC_API_KEY` | worker (+ web summary route) | For data | Worker ingests but can't classify; site stays empty |
| `EXPORT_API_KEY` | web | No | `/api/v1/export` disabled (503) |
| `AISSTREAM_API_KEY` | web | No | Maritime tab shows labeled placeholder |
| `COMMODITIES_API_KEY` | web | No | Commodity prices show `—` |
| `OPENSKY_CLIENT_ID/SECRET` | web | No | ADS-B works anonymously, lower rate limit |
| `OPS_ALERT_WEBHOOK_URL` | worker | No | No staleness alerts (UI still shows STALE) |

The web app validates `DATABASE_URL` on boot (`instrumentation.ts`) and logs
which optional integrations are active.

## One-command database bootstrap

Run once against the production DB (and again after any new migration):

```bash
DATABASE_URL="postgres://…(direct, unpooled)…" ./scripts/prod-setup.sh
```

This installs deps, generates the Prisma client (incl. the Linux runtime
binary), applies all migrations (`prisma migrate deploy`), and seeds the
curated exposure graph. It does not start servers — the platforms do that.

## Deploy checklist

- [ ] Provision Postgres (Neon free tier is enough to start). Copy both the
      **pooled** and **direct** connection strings.
- [ ] Run `./scripts/prod-setup.sh` with the **direct** URL.
- [ ] Deploy **apps/web** to Vercel (see step-by-step in the project README /
      chat). Root Directory = `apps/web`. Set env vars (use the **pooled** URL).
- [ ] Deploy **apps/worker** to Railway. Set env vars (use the **direct** URL).
      Confirm restart-on-failure is on.
- [ ] Top up Anthropic credits — until then the site renders but has no
      conflict data.
- [ ] (Optional) Add UptimeRobot on the Vercel URL and the `/api/heartbeat`
      endpoint; wire `OPS_ALERT_WEBHOOK_URL` to Slack.

## Reliability posture (already built in)

- Every external feed (USGS, GDACS, WHO, OpenSky, AIS, commodities) is wrapped
  in try/catch with a timeout and returns an honest empty/placeholder state on
  failure — no route crashes if a provider is down.
- Read-heavy API routes carry `Cache-Control: s-maxage` so Vercel's CDN
  absorbs repeat traffic; historical replay responses cache for 1h+.
- Cost-bearing routes (`/api/events/[id]/summary`, AIS, ADS-B) are
  rate-limited per client.
- The worker has a cycle mutex, crash handlers, a watchdog timeout, and a
  staleness self-alert.
