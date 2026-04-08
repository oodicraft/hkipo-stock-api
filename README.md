# HKIPO Stock api

Cloudflare Worker + Hono + D1 backend for public Hong Kong IPO data.

## What It Does

- Serves a landing page at `/` with service status and the latest 10 IPO rows
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

2. Create your local Wrangler config from the template:

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

3. Edit `wrangler.jsonc` and fill in your own values:

- Set `name`
- Set `workers_dev` or `routes`
- Set `d1_databases[].database_name`
- Set `d1_databases[].database_id`

4. Create local secrets in `.dev.vars` and keep the file untracked:

```bash
cp .dev.vars.example .dev.vars
```

5. Apply local D1 migrations:

```bash
npx wrangler d1 migrations apply HKIPO_DB --local
```

6. Start local development server:

```bash
npm run dev
```

7. Trigger the scheduled sync locally:

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

- `wrangler.jsonc` is local-only and ignored by git.
- Start from `wrangler.example.jsonc`, then copy it to `wrangler.jsonc` and fill in your real Worker, route, and D1 values.
- Keep `.dev.vars`, `.env`, and any real secrets out of the repository.
