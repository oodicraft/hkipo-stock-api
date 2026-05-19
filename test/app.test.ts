import test from "node:test";
import assert from "node:assert/strict";
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
    getAllocationRowsByCode: async () => [],
    getLatestAllocationChartStocks: async () => [],
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

test("GET /privacy returns the privacy policy page", async () => {
  const app = createTestApp();
  const response = await app.request("https://localhost/privacy");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /HOOOK 隐私政策/);
  assert.match(html, /Cloudflare D1/);
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

test("GET /v2/ipos/:code/allocation-rows returns allocation rows for the requested code", async () => {
  let requestedCode = "";
  const row = {
    id: 1,
    newsId: "123456",
    pool: "A",
    sharesApplied: 2000,
    validApplications: 100,
    allocationText: "50 out of 100 valid applications receive 200 shares",
    successfulApplications: 50,
    allottedSharesPerSuccessfulApplication: 200,
    allottedPercentText: "50%",
    allottedRatio: 0.5,
    rowOrder: 1
  };
  const app = createTestApp({
    getAllocationRowsByCode: async (_env, code) => {
      requestedCode = code;
      return [row];
    }
  });

  const response = await app.request("https://localhost/v2/ipos/01236/allocation-rows");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(requestedCode, "01236");
  assert.deepEqual(body, {
    items: [row],
    count: 1
  });
});

test("GET /v2/ipos/:code/allocation-rows returns an empty list when no rows exist", async () => {
  const app = createTestApp({
    getAllocationRowsByCode: async () => []
  });

  const response = await app.request("https://localhost/v2/ipos/09999/allocation-rows");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    items: [],
    count: 0
  });
});

test("GET /allocation-charts returns allocation chart HTML", async () => {
  const app = createTestApp({
    getLatestAllocationChartStocks: async () => [
      {
        stockCode: "01236",
        stockName: "Example Holdings",
        releaseTime: "18/05/2026 16:30",
        newsId: "news-1236",
        pools: [
          {
            pool: "A",
            points: [
              {
                sharesApplied: 2000,
                validApplications: 100,
                allottedPercentText: "50%",
                rowOrder: 1
              }
            ]
          },
          {
            pool: "B",
            points: [
              {
                sharesApplied: 100000,
                validApplications: 12,
                allottedPercentText: "10%",
                rowOrder: 2
              }
            ]
          }
        ]
      },
      {
        stockCode: "09999",
        stockName: "Second IPO",
        releaseTime: "17/05/2026 12:00",
        newsId: "news-9999",
        pools: [
          {
            pool: "A",
            points: [
              {
                sharesApplied: 5000,
                validApplications: 250,
                allottedPercentText: "25%",
                rowOrder: 1
              }
            ]
          }
        ]
      }
    ]
  });

  const response = await app.request("https://localhost/allocation-charts");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Allocation Charts/);
  assert.match(html, /HK 01236/);
  assert.match(html, /Example Holdings/);
  assert.match(html, /Pool A/);
  assert.match(html, /Pool B/);
  assert.match(html, /2,000 shares applied; 100 applications/);
  assert.match(html, /100,000 shares applied; 12 applications/);
  assert.match(html, /HK 09999/);
});

test("GET /allocation-charts returns an empty state when no allocation rows exist", async () => {
  const app = createTestApp({
    getLatestAllocationChartStocks: async () => []
  });

  const response = await app.request("https://localhost/allocation-charts");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /No allocation rows are available yet/);
});

test("GET /favicon.ico returns the site favicon", async () => {
  const app = createTestApp();
  const response = await app.request("https://localhost/favicon.ico");
  const body = await response.arrayBuffer();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/x-icon");
  assert.ok(body.byteLength > 0);
});
