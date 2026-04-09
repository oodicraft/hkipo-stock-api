import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ANALYTICS_CLIENT_PATH, ingestClientAnalyticsPayload, trackLandingPageView } from "./analytics";
import { renderLandingPage } from "./landing";
import { DOWNLOAD_LATEST_PATH, PRIVACY_POLICY_PATH, RELEASE_NOTES_PATH, faviconResponse, getAppUpdate, getLatestDownloadUrl, renderPrivacyPolicyPage, renderReleaseNotesPage } from "./site";
import type { ListQuery } from "./repository";
import { fetchAndParseIPOData } from "./scraper";
import { getIPODetail, getIPOStats, getLatestIPOItems, getServiceHealth, listIPOs, upsertCurrentAndArchive } from "./repository";
import type { Env, IPODetail, IPOListItem, IPOStats, PublicIPOStats, PublicSyncSummary, ServiceHealth } from "./types";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRequiredText(value: string | undefined, field: string): string {
  if (!value || value.trim().length === 0) {
    throw new HTTPException(400, { message: `Missing ${field}` });
  }

  return value;
}

interface AppDependencies {
  getServiceHealth: (env: Env) => Promise<ServiceHealth>;
  getIPOStats: (env: Env) => Promise<IPOStats>;
  getLatestIPOItems: (env: Env, limit: number) => Promise<IPOListItem[]>;
  listIPOs: (env: Env, query: ListQuery) => Promise<IPOListItem[]>;
  getIPODetail: (env: Env, code: string) => Promise<IPODetail | null>;
  trackLandingPageView: (env: Partial<Env>, request: Request) => Promise<void>;
  ingestClientAnalyticsPayload: (env: Partial<Env>, request: Request, payload: unknown) => Promise<void>;
}

const defaultDependencies: AppDependencies = {
  getServiceHealth,
  getIPOStats,
  getLatestIPOItems,
  listIPOs,
  getIPODetail,
  trackLandingPageView,
  ingestClientAnalyticsPayload
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

  app.get("/favicon.ico", () => faviconResponse());

  app.get("/", async (c) => {
    const trackRequest = dependencies.trackLandingPageView(c.env, c.req.raw).catch((error) => {
      console.error("Failed tracking landing page view", error);
    });

    let executionCtx: ExecutionContext | null = null;
    try {
      executionCtx = c.executionCtx;
    } catch {
      executionCtx = null;
    }

    if (executionCtx) {
      executionCtx.waitUntil(trackRequest);
    } else {
      void trackRequest;
    }

    const [health, stats, latestItems] = await Promise.all([
      dependencies.getServiceHealth(c.env),
      dependencies.getIPOStats(c.env),
      dependencies.getLatestIPOItems(c.env, 10)
    ]);

    return c.html(renderLandingPage({ health, stats, latestItems }));
  });

  app.get(PRIVACY_POLICY_PATH, (c) => {
    return c.html(renderPrivacyPolicyPage());
  });

  app.get(RELEASE_NOTES_PATH, (c) => {
    return c.html(renderReleaseNotesPage());
  });

  app.get(DOWNLOAD_LATEST_PATH, (c) => {
    return c.redirect(getLatestDownloadUrl(), 302);
  });

  app.get("/v2/health", async (c) => {
    return c.json(await dependencies.getServiceHealth(c.env));
  });

  app.get("/v2/app/update", (c) => {
    const currentBuild = parseNumber(c.req.query("currentBuild"), Number.NaN);
    if (!Number.isFinite(currentBuild)) {
      throw new HTTPException(400, { message: "Missing currentBuild" });
    }

    return c.json(
      getAppUpdate({
        platform: parseRequiredText(c.req.query("platform"), "platform"),
        channel: parseRequiredText(c.req.query("channel"), "channel"),
        currentVersion: parseRequiredText(c.req.query("currentVersion"), "currentVersion"),
        currentBuild,
        origin: new URL(c.req.url).origin
      })
    );
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

  app.post(ANALYTICS_CLIENT_PATH, async (c) => {
    let payload: unknown;

    try {
      payload = await c.req.json();
      await dependencies.ingestClientAnalyticsPayload(c.env, c.req.raw, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid analytics request";
      throw new HTTPException(message.includes("configured") ? 503 : 400, { message });
    }

    return c.json({ ok: true }, 202);
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
