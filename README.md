# HK IPO Backend

Cloudflare Worker + Hono + D1 backend for HK IPO data.

## What It Does

- Serves a landing page at `/` with live service status and the latest 10 IPO rows
- Exposes read-only APIs under `/v2/...`
- Runs a daily Cloudflare `scheduled` task to fetch and normalize IPO data from Jina
- Stores the latest records in `ipo_current`
- Archives each sync batch into `ipo_snapshot`
- Tracks sync runs in `sync_run`

## Stack

- Hono
- Wrangler
- Cloudflare Workers
- Cloudflare D1

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Apply local D1 migrations:

```bash
npx wrangler d1 migrations apply HKIPO_DB --local
```

3. Start local development server:

```bash
npm run dev
```

4. Trigger the scheduled sync locally:

```bash
npm run cron:local
```

## API

- `GET /`
- `GET /v2/health`
- `GET /v2/ipos`
- `GET /v2/ipos/:code`
- `GET /v2/ipos/stats`

## Deployment Notes

- Set the `JINA_KEY` secret before deploying:

```bash
npx wrangler secret put JINA_KEY
```

- Create the production D1 database as `hkipo-db-prod`, then update the D1 `database_id` in `wrangler.jsonc`.
- The Worker is configured to serve the custom domain `hkipo.langtangs.com` directly, with the landing page at `/` and the API under `/v2/...`.
