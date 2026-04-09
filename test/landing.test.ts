import test from "node:test";
import assert from "node:assert/strict";
import { renderLandingPage } from "../src/landing";

test("renderLandingPage includes the editorial landing structure and ipo data", () => {
  const html = renderLandingPage({
    health: {
      ok: true,
      service: "hkipo-stock-api",
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
        code: "02729",
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

  assert.match(html, /HKIPO Stock api/);
  assert.match(html, /Download macOS app/);
  assert.match(html, /\/downloads\/hkipo-macos-latest/);
  assert.match(html, /Native macOS with hkipo api/);
  assert.match(html, /Keep your Hong Kong IPO subscriptions in view from the menu bar/);
  assert.match(html, /\/screenshot-macos\.jpg/);
  assert.match(html, /Live service status/);
  assert.match(html, /Latest IPOs/);
  assert.match(html, /Example Holdings/);
  assert.match(html, /\/v2\/ipos/);
  assert.match(html, /Operational/);
  assert.match(html, /Connected/);
  assert.match(html, /Privacy Policy/);
  assert.match(html, /rel="icon"/);
});
