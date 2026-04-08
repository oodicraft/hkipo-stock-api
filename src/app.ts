import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { renderLandingPage } from "./landing";
import type { ListQuery } from "./repository";
import { fetchAndParseIPOData } from "./scraper";
import { getIPODetail, getIPOStats, getLatestIPOItems, getServiceHealth, listIPOs, upsertCurrentAndArchive } from "./repository";
import type { Env, IPODetail, IPOListItem, IPOStats, PublicIPOStats, PublicSyncSummary, ServiceHealth } from "./types";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface AppDependencies {
  getServiceHealth: (env: Env) => Promise<ServiceHealth>;
  getIPOStats: (env: Env) => Promise<IPOStats>;
  getLatestIPOItems: (env: Env, limit: number) => Promise<IPOListItem[]>;
  listIPOs: (env: Env, query: ListQuery) => Promise<IPOListItem[]>;
  getIPODetail: (env: Env, code: string) => Promise<IPODetail | null>;
}

const defaultDependencies: AppDependencies = {
  getServiceHealth,
  getIPOStats,
  getLatestIPOItems,
  listIPOs,
  getIPODetail
};

function toPublicSyncSummary(sync: IPOStats["latestSync"]): PublicSyncSummary | null {
  if (!sync) {
    return null;
  }

  const { errorMessage: _errorMessage, ...publicSync } = sync;
  return publicSync;
}

function toPublicIPOStats(stats: IPOStats): PublicIPOStats {
  return {
    counts: stats.counts,
    latestSync: toPublicSyncSummary(stats.latestSync)
  };
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const [health, stats, latestItems] = await Promise.all([
      dependencies.getServiceHealth(c.env),
      dependencies.getIPOStats(c.env),
      dependencies.getLatestIPOItems(c.env, 10)
    ]);

    return c.html(renderLandingPage({ health, stats, latestItems }));
  });

  app.get("/v2/health", async (c) => {
    return c.json(await dependencies.getServiceHealth(c.env));
  });

  app.get("/v2/ipos", async (c) => {
    const items = await dependencies.listIPOs(c.env, {
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
    return c.json(toPublicIPOStats(await dependencies.getIPOStats(c.env)));
  });

  app.get("/v2/ipos/:code", async (c) => {
    const detail = await dependencies.getIPODetail(c.env, c.req.param("code"));
    if (!detail) {
      throw new HTTPException(404, { message: "IPO not found" });
    }
    return c.json(detail);
  });

  app.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500;
    const message = status >= 500 ? "Internal Server Error" : error.message;
    return c.json(
      {
        error: message
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
