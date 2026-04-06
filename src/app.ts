import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { renderLandingPage } from "./landing";
import { fetchAndParseIPOData } from "./scraper";
import { getIPODetail, getIPOStats, getLatestIPOItems, getServiceHealth, listIPOs, upsertCurrentAndArchive } from "./repository";
import type { Env } from "./types";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const [health, stats, latestItems] = await Promise.all([
      getServiceHealth(c.env),
      getIPOStats(c.env),
      getLatestIPOItems(c.env, 10)
    ]);

    return c.html(renderLandingPage({ health, stats, latestItems }));
  });

  app.get("/v2/health", async (c) => {
    return c.json(await getServiceHealth(c.env));
  });

  app.get("/v2/ipos", async (c) => {
    const items = await listIPOs(c.env, {
      status: c.req.query("status"),
      q: c.req.query("q"),
      limit: parseNumber(c.req.query("limit"), 100),
      offset: parseNumber(c.req.query("offset"), 0),
      from: c.req.query("from"),
      to: c.req.query("to")
    });

    return c.json({
      items,
      count: items.length
    });
  });

  app.get("/v2/ipos/stats", async (c) => {
    return c.json(await getIPOStats(c.env));
  });

  app.get("/v2/ipos/:code", async (c) => {
    const detail = await getIPODetail(c.env, c.req.param("code"));
    if (!detail) {
      throw new HTTPException(404, { message: "IPO not found" });
    }
    return c.json(detail);
  });

  app.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500;
    return c.json(
      {
        error: error.message
      },
      status
    );
  });

  return app;
}

export async function runScheduledSync(env: Env) {
  const records = await fetchAndParseIPOData(env);
  return upsertCurrentAndArchive(env, records);
}
