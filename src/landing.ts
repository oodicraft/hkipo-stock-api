import type { IPOListItem, IPOStats, ServiceHealth } from "./types";

interface LandingPageData {
  health: ServiceHealth;
  stats: IPOStats;
  latestItems: IPOListItem[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatValue(value: string | null, fallback = "TBD"): string {
  return value && value.trim().length > 0 ? escapeHtml(value) : fallback;
}

function statusLabel(status: IPOListItem["status"]): string {
  if (status === "open") {
    return "Open";
  }
  if (status === "listed") {
    return "Listed";
  }
  return "Upcoming";
}

function statusClass(status: IPOListItem["status"]): string {
  if (status === "open") {
    return "status-open";
  }
  if (status === "listed") {
    return "status-listed";
  }
  return "status-upcoming";
}

function renderItemRow(item: IPOListItem): string {
  const prospectus = item.prospectusUrl
    ? `<a class="prospectus-link" href="${escapeHtml(item.prospectusUrl)}" target="_blank" rel="noreferrer">Prospectus</a>`
    : '<span class="muted">Unavailable</span>';

  return `
    <article class="ipo-row">
      <div class="ipo-main">
        <div class="ipo-heading">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="status-pill ${statusClass(item.status)}">${statusLabel(item.status)}</span>
        </div>
        <p class="ipo-meta">HK ${escapeHtml(item.code)} · ${formatValue(item.board, "Main Board")}</p>
      </div>
      <div class="ipo-data">
        <span><strong>Subscribe</strong>${formatValue(item.subStart)} → ${formatValue(item.subEnd)}</span>
        <span><strong>List</strong>${formatValue(item.listDate)}</span>
        <span><strong>Lot</strong>${formatValue(item.lotAmount, "--")}</span>
        <span><strong>Price</strong>${formatValue(item.priceRange, "--")}</span>
        <span><strong>Docs</strong>${prospectus}</span>
      </div>
    </article>
  `;
}

export function renderLandingPage(data: LandingPageData): string {
  const latestSync = data.stats.latestSync;
  const latestSyncStatus = latestSync ? escapeHtml(latestSync.status) : "waiting";
  const latestSyncTime = latestSync?.finishedAt ?? latestSync?.startedAt ?? "Not synced yet";
  const latestSyncSummary = latestSync
    ? `${latestSync.totalCount} rows · ${latestSync.insertedCount} inserted · ${latestSync.updatedCount} updated`
    : "The first scheduled sync has not completed yet.";

  const itemsMarkup =
    data.latestItems.length > 0
      ? data.latestItems.map(renderItemRow).join("")
      : '<div class="empty-state">No IPO records are available in D1 yet. The first cron sync will populate this view.</div>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HK IPO API</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f1e8;
        --bg-soft: rgba(255, 255, 255, 0.72);
        --panel: rgba(255, 252, 246, 0.88);
        --border: rgba(59, 46, 30, 0.12);
        --text: #261b12;
        --muted: #6f6254;
        --accent: #c86d2b;
        --accent-soft: rgba(200, 109, 43, 0.12);
        --green: #2d7a53;
        --blue: #2f5f9d;
        --gold: #8e6b1c;
        --shadow: 0 24px 60px rgba(83, 61, 31, 0.10);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(246, 215, 178, 0.8), transparent 34%),
          radial-gradient(circle at right 20%, rgba(208, 227, 219, 0.72), transparent 30%),
          linear-gradient(180deg, #fbf7f2 0%, var(--bg) 100%);
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .shell {
        max-width: 1180px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }

      .hero {
        padding: 40px 0 30px;
        display: grid;
        gap: 22px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        width: fit-content;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.66);
        color: var(--muted);
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        max-width: 880px;
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        font-size: clamp(44px, 7vw, 86px);
        line-height: 0.98;
        font-weight: 600;
        letter-spacing: -0.04em;
      }

      .hero-copy {
        max-width: 760px;
        color: var(--muted);
        font-size: 19px;
        line-height: 1.7;
      }

      .top-grid {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 18px;
        margin-top: 10px;
      }

      .panel {
        border: 1px solid var(--border);
        border-radius: 28px;
        background: var(--panel);
        backdrop-filter: blur(20px);
        box-shadow: var(--shadow);
      }

      .status-card {
        padding: 26px;
        display: grid;
        gap: 18px;
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .metric {
        padding: 18px;
        border-radius: 22px;
        background: var(--bg-soft);
        border: 1px solid rgba(59, 46, 30, 0.08);
      }

      .metric-label {
        display: block;
        margin-bottom: 8px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .metric-value {
        font-size: 24px;
        line-height: 1.2;
        font-weight: 600;
      }

      .metric-copy {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.55;
      }

      .api-card {
        padding: 26px;
        display: grid;
        gap: 14px;
      }

      .api-links {
        display: grid;
        gap: 10px;
      }

      .api-link {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(59, 46, 30, 0.08);
        background: rgba(255, 255, 255, 0.66);
      }

      .api-link span:last-child {
        color: var(--muted);
      }

      .section {
        margin-top: 22px;
        padding: 26px;
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: end;
        margin-bottom: 22px;
      }

      .section-header h2 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        font-size: clamp(28px, 3vw, 38px);
        font-weight: 600;
        letter-spacing: -0.03em;
      }

      .section-header p {
        margin: 0;
        color: var(--muted);
        max-width: 520px;
        line-height: 1.6;
      }

      .stats-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 20px;
      }

      .stats-tile {
        padding: 18px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(59, 46, 30, 0.08);
      }

      .stats-tile strong {
        display: block;
        font-size: 34px;
        line-height: 1;
        margin-top: 10px;
      }

      .stats-tile span {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
      }

      .ipo-list {
        display: grid;
        gap: 14px;
      }

      .ipo-row {
        padding: 20px;
        border-radius: 24px;
        border: 1px solid rgba(59, 46, 30, 0.08);
        background: rgba(255, 255, 255, 0.78);
        display: grid;
        gap: 16px;
      }

      .ipo-heading {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .ipo-heading h3 {
        margin: 0;
        font-size: 24px;
        line-height: 1.15;
      }

      .ipo-meta {
        margin: 8px 0 0;
        color: var(--muted);
      }

      .ipo-data {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 12px;
      }

      .ipo-data span {
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }

      .ipo-data strong {
        color: var(--text);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border: 1px solid transparent;
      }

      .status-upcoming {
        color: var(--gold);
        background: rgba(204, 166, 69, 0.14);
        border-color: rgba(204, 166, 69, 0.22);
      }

      .status-open {
        color: var(--green);
        background: rgba(45, 122, 83, 0.14);
        border-color: rgba(45, 122, 83, 0.22);
      }

      .status-listed {
        color: var(--blue);
        background: rgba(47, 95, 157, 0.14);
        border-color: rgba(47, 95, 157, 0.22);
      }

      .prospectus-link {
        color: var(--accent);
      }

      .muted,
      .empty-state {
        color: var(--muted);
      }

      .empty-state {
        padding: 24px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px dashed rgba(59, 46, 30, 0.16);
      }

      @media (max-width: 960px) {
        .top-grid,
        .stats-row,
        .ipo-data {
          grid-template-columns: 1fr;
        }

        .status-grid {
          grid-template-columns: 1fr;
        }

        .section-header,
        .ipo-heading {
          align-items: start;
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="eyebrow">HK IPO API · Cloudflare Worker</div>
        <h1>Live market-ready IPO data for your SwiftUI client and every downstream tool.</h1>
        <p class="hero-copy">
          This service runs on Hono + Wrangler + D1, refreshes from Jina on a daily Cloudflare cron,
          and exposes the current Hong Kong IPO feed through a stable <code>/v2</code> API.
        </p>
      </section>

      <section class="top-grid">
        <div class="panel status-card">
          <div class="status-grid">
            <div class="metric">
              <span class="metric-label">Worker Status</span>
              <div class="metric-value">${data.health.ok ? "Operational" : "Degraded"}</div>
              <p class="metric-copy">Service: ${escapeHtml(data.health.service)}</p>
            </div>
            <div class="metric">
              <span class="metric-label">D1 Connectivity</span>
              <div class="metric-value">${data.health.database === "connected" ? "Connected" : "Disconnected"}</div>
              <p class="metric-copy">Reads are served directly from the production D1 dataset.</p>
            </div>
            <div class="metric">
              <span class="metric-label">Latest Sync</span>
              <div class="metric-value">${escapeHtml(latestSyncStatus)}</div>
              <p class="metric-copy">${escapeHtml(latestSyncTime)}</p>
            </div>
            <div class="metric">
              <span class="metric-label">Run Summary</span>
              <div class="metric-value">${latestSync ? String(latestSync.totalCount) : "0"} rows</div>
              <p class="metric-copy">${escapeHtml(latestSyncSummary)}</p>
            </div>
          </div>
        </div>

        <aside class="panel api-card">
          <div>
            <span class="metric-label">API Surface</span>
            <div class="metric-value">Machine-readable endpoints</div>
            <p class="metric-copy">Everything below stays under the same production Worker and custom domain.</p>
          </div>
          <div class="api-links">
            <a class="api-link" href="/v2/health"><span>/v2/health</span><span>Service + D1 health</span></a>
            <a class="api-link" href="/v2/ipos?limit=10"><span>/v2/ipos</span><span>Filterable IPO list</span></a>
            <a class="api-link" href="/v2/ipos/stats"><span>/v2/ipos/stats</span><span>Counts + latest sync summary</span></a>
            <a class="api-link" href="/v2/ipos/02506"><span>/v2/ipos/:code</span><span>Single IPO detail</span></a>
          </div>
        </aside>
      </section>

      <section class="panel section">
        <div class="section-header">
          <div>
            <h2>Snapshot of the current market</h2>
            <p>The latest ten IPO records below are served from the same D1 tables used by the SwiftUI app.</p>
          </div>
        </div>

        <div class="stats-row">
          <div class="stats-tile">
            <span>Upcoming</span>
            <strong>${data.stats.counts.upcoming}</strong>
          </div>
          <div class="stats-tile">
            <span>Open</span>
            <strong>${data.stats.counts.open}</strong>
          </div>
          <div class="stats-tile">
            <span>Listed</span>
            <strong>${data.stats.counts.listed}</strong>
          </div>
        </div>

        <div class="ipo-list">
          ${itemsMarkup}
        </div>
      </section>
    </main>
  </body>
</html>`;
}
