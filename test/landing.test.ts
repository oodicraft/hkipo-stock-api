import test from "node:test";
import assert from "node:assert/strict";
import { renderLandingPage } from "../src/landing";

test("renderLandingPage includes the editorial landing structure and ipo data", () => {
  const html = renderLandingPage({
    health: {
      ok: true,
      service: "hkipo-backend",
      database: "connected"
    },
    stats: {
      counts: {
        upcoming: 2,
        open: 3,
        listed: 5
      },
      latestSync: {
        id: "sync-1",
        startedAt: "2026-04-06T11:17:00+08:00",
        finishedAt: "2026-04-06T11:18:00+08:00",
        status: "success",
        insertedCount: 4,
        updatedCount: 6,
        totalCount: 10,
        errorMessage: null
      }
    },
    latestItems: [
      {
        code: "02506",
        name: "Example Holdings",
        subStart: "2026-04-08",
        subEnd: "2026-04-10",
        listDate: "2026-04-16",
        lotAmount: "HK$3,636.31",
        priceRange: "12.00 - 15.00",
        prospectusUrl: "https://example.com/prospectus.pdf",
        status: "open",
        board: "Main Board"
      }
    ]
  });

  assert.match(html, /HK IPO API/);
  assert.match(html, /Open the live feed/);
  assert.match(html, /Market pulse, from the production Worker/);
  assert.match(html, /Recent IPO feed/);
  assert.match(html, /Example Holdings/);
  assert.match(html, /\/v2\/ipos/);
  assert.match(html, /Operational/);
  assert.match(html, /Connected/);
});
