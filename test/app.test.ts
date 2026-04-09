import test from "node:test";
import assert from "node:assert/strict";
import { ANALYTICS_CLIENT_PATH } from "../src/analytics";
import { createApp } from "../src/app";

function createTestApp(overrides: Parameters<typeof createApp>[0] = {}) {
  return createApp({
    getServiceHealth: async () => ({
      ok: true,
      service: "hkipo-stock-api",
      database: "connected"
    }),
    getIPOStats: async () => ({
      counts: {
        upcoming: 1,
        open: 2,
        listed: 3
      },
      latestSync: null
    }),
    getLatestIPOItems: async () => [],
    listIPOs: async () => [],
    getIPODetail: async () => null,
    trackLandingPageView: async () => {},
    ingestClientAnalyticsPayload: async () => {},
    ...overrides
  });
}

test("GET /v2/health returns the public service identifier", async () => {
  const app = createTestApp();
  const response = await app.request("http://localhost/v2/health");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.service, "hkipo-stock-api");
});

test("GET /v2/ipos/stats does not expose sync error details", async () => {
  const app = createTestApp({
    getIPOStats: async () => ({
      counts: {
        upcoming: 1,
        open: 2,
        listed: 3
      },
      latestSync: {
        id: "sync-1",
        startedAt: "2026-04-06T11:17:00+08:00",
        finishedAt: "2026-04-06T11:18:00+08:00",
        status: "failed",
        insertedCount: 0,
        updatedCount: 0,
        totalCount: 0,
        errorMessage: "database password leaked"
      }
    })
  });

  const response = await app.request("http://localhost/v2/ipos/stats");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.latestSync.status, "failed");
  assert.equal("errorMessage" in body.latestSync, false);
});

test("internal errors return a generic 500 response", async () => {
  const app = createTestApp({
    getServiceHealth: async () => {
      throw new Error("sensitive upstream detail");
    }
  });

  const response = await app.request("http://localhost/v2/health");
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: "Internal Server Error" });
});

test("GET / triggers landing page analytics tracking", async () => {
  let trackedURL = "";
  const app = createTestApp({
    trackLandingPageView: async (_env, request) => {
      trackedURL = request.url;
    }
  });

  const response = await app.request("https://localhost/");

  assert.equal(response.status, 200);
  assert.equal(trackedURL, "https://localhost/");
});

test("GET /privacy returns the privacy policy page", async () => {
  const app = createTestApp();
  const response = await app.request("https://localhost/privacy");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /HOOOK 隐私政策/);
  assert.match(html, /Workers Analytics Engine/);
});

test("GET /v2/app/update returns direct channel release metadata", async () => {
  const app = createTestApp();
  const response = await app.request(
    "https://localhost/v2/app/update?platform=macos&channel=direct&currentVersion=2.1.0&currentBuild=6"
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.updateAvailable, true);
  assert.equal(body.latestVersion, "2.2.0");
  assert.equal(body.latestBuild, 7);
  assert.equal(body.downloadUrl, "https://localhost/downloads/hkipo-macos-latest");
  assert.equal(body.releaseNotesUrl, "https://localhost/releases/latest");
});

test("GET /downloads/hkipo-macos-latest redirects to the configured package URL", async () => {
  const app = createTestApp();
  const response = await app.request("https://localhost/downloads/hkipo-macos-latest");

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://hkipo.langtangs.com/downloads/HK-IPO-macOS.dmg");
});

test("GET /favicon.ico returns the site favicon", async () => {
  const app = createTestApp();
  const response = await app.request("https://localhost/favicon.ico");
  const body = await response.arrayBuffer();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/x-icon");
  assert.ok(body.byteLength > 0);
});

test("POST /v2/analytics/client returns 202 for valid client payloads", async () => {
  let capturedPayload: unknown = null;
  const app = createTestApp({
    ingestClientAnalyticsPayload: async (_env, _request, payload) => {
      capturedPayload = payload;
    }
  });

  const response = await app.request(ANALYTICS_CLIENT_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      event: "app_active",
      installId: "abc123",
      occurredAt: "2026-04-09T09:12:00Z",
      appVersion: "1.0.0",
      platform: "macos"
    })
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.deepEqual(body, { ok: true });
  assert.deepEqual(capturedPayload, {
    event: "app_active",
    installId: "abc123",
    occurredAt: "2026-04-09T09:12:00Z",
    appVersion: "1.0.0",
    platform: "macos"
  });
});

test("POST /v2/analytics/client returns 400 when analytics payload is invalid", async () => {
  const app = createTestApp({
    ingestClientAnalyticsPayload: async () => {
      throw new Error("Unsupported analytics event");
    }
  });

  const response = await app.request("https://localhost/v2/analytics/client", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      event: "detail_view"
    })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, { error: "Unsupported analytics event" });
});
