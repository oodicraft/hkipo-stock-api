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
