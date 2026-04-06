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
    ? `<a class="prospectus-link" href="${escapeHtml(item.prospectusUrl)}" target="_blank" rel="noreferrer">Open prospectus</a>`
    : '<span class="muted">Unavailable</span>';

  return `
    <article class="ipo-row">
      <div class="ipo-row-head">
        <div class="ipo-title-group">
          <h3>${escapeHtml(item.name)}</h3>
          <p class="ipo-meta">HK ${escapeHtml(item.code)} · ${formatValue(item.board, "Main Board")}</p>
        </div>
        <span class="status-pill ${statusClass(item.status)}">${statusLabel(item.status)}</span>
      </div>
      <dl class="ipo-facts">
        <div>
          <dt>Subscribe</dt>
          <dd>${formatValue(item.subStart)} → ${formatValue(item.subEnd)}</dd>
        </div>
        <div>
          <dt>List</dt>
          <dd>${formatValue(item.listDate)}</dd>
        </div>
        <div>
          <dt>Lot</dt>
          <dd>${formatValue(item.lotAmount, "--")}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>${formatValue(item.priceRange, "--")}</dd>
        </div>
        <div>
          <dt>Docs</dt>
          <dd>${prospectus}</dd>
        </div>
      </dl>
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
  const healthStatus = data.health.ok ? "Operational" : "Degraded";
  const databaseStatus = data.health.database === "connected" ? "Connected" : "Disconnected";

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
    <meta
      name="description"
      content="HK IPO API serves Hong Kong IPO market data through a stable Cloudflare Worker and D1-backed /v2 endpoints."
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        color-scheme: light;
        --background: #faf6f2;
        --background-secondary: #f0ece6;
        --foreground: #1a1815;
        --foreground-soft: #4f4a43;
        --foreground-muted: #756f67;
        --border: rgba(26, 24, 21, 0.24);
        --border-soft: rgba(26, 24, 21, 0.12);
        --button-bg: #1d1d1f;
        --button-text: #fffdf9;
        --pill-bg: #f2eee8;
      }

      * {
        box-sizing: border-box;
      }

      html {
        background: var(--background);
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--background);
        color: var(--foreground);
        font-family: "Barlow", "Avenir Next", "Segoe UI", sans-serif;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      code {
        font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.95em;
        padding: 0.1em 0.35em;
        border-radius: 999px;
        background: var(--background-secondary);
      }

      .page {
        display: flex;
        justify-content: center;
        min-height: 100vh;
        padding: 0 16px;
      }

      .frame {
        width: 100%;
        max-width: 768px;
        min-height: 100vh;
        background: var(--background);
      }

      .site-header,
      .section,
      .value-grid,
      .site-footer {
        border-left: 0.5px solid var(--border);
        border-right: 0.5px solid var(--border);
      }

      .site-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 16px 20px;
        border-bottom: 0.5px solid var(--border);
      }

      .site-title-wrap {
        min-width: 0;
      }

      .brand {
        display: inline-block;
        font-size: 2rem;
        line-height: 1;
      }

      .site-tagline {
        margin: 6px 0 0;
        color: var(--foreground-muted);
        font-size: 0.98rem;
      }

      .primary-cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0.5px solid var(--button-bg);
        border-radius: 999px;
        padding: 10px 16px;
        background: var(--button-bg);
        color: var(--button-text);
        font-size: 0.96rem;
        font-weight: 600;
        white-space: nowrap;
      }

      .hero {
        padding: 44px 20px 36px;
        text-align: center;
      }

      .hero-kicker {
        margin: 0;
        color: var(--foreground-muted);
        font-size: 0.95rem;
        letter-spacing: 0.02em;
      }

      h1,
      h2,
      h3,
      .brand {
        font-family: "Instrument Serif", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        font-weight: 400;
      }

      h1 {
        margin: 20px auto 0;
        max-width: 11ch;
        font-size: clamp(3rem, 9vw, 5rem);
        line-height: 0.96;
        letter-spacing: -0.03em;
        text-wrap: balance;
      }

      .hero-copy {
        margin: 22px auto 0;
        max-width: 620px;
        color: var(--foreground-soft);
        font-size: 1.08rem;
        line-height: 1.75;
      }

      .value-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        border-top: 0.5px solid var(--border);
        border-bottom: 0.5px solid var(--border);
      }

      .value-card {
        padding: 20px;
      }

      .value-card + .value-card {
        border-left: 0.5px solid var(--border);
      }

      .value-card h2 {
        margin: 0 0 14px;
        font-size: 1.9rem;
        line-height: 1.08;
      }

      .value-card p {
        margin: 0;
        color: var(--foreground-soft);
        line-height: 1.65;
      }

      .section {
        padding: 28px 20px;
      }

      .section + .section {
        border-top: 0.5px solid var(--border);
      }

      .section-intro {
        margin-bottom: 22px;
      }

      .section-intro h2 {
        margin: 0;
        font-size: clamp(2rem, 5vw, 3rem);
        line-height: 1;
        letter-spacing: -0.02em;
      }

      .section-intro p {
        margin: 12px 0 0;
        color: var(--foreground-soft);
        line-height: 1.7;
      }

      .pulse-grid,
      .totals-grid {
        display: grid;
        gap: 0;
        border: 0.5px solid var(--border);
      }

      .pulse-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .pulse-card,
      .total-card {
        padding: 18px;
      }

      .pulse-card {
        min-height: 146px;
      }

      .pulse-card:nth-child(odd) {
        border-right: 0.5px solid var(--border);
      }

      .total-card + .total-card {
        border-left: 0.5px solid var(--border);
      }

      .pulse-card:nth-child(-n + 2) {
        border-bottom: 0.5px solid var(--border);
      }

      .metric-label,
      .total-card span,
      .endpoint-label,
      .ipo-facts dt {
        display: block;
        color: var(--foreground-muted);
        font-size: 0.76rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .metric-value,
      .total-card strong {
        display: block;
        margin-top: 10px;
        font-size: 1.9rem;
        line-height: 1;
        font-weight: 600;
      }

      .metric-copy,
      .section-note {
        margin: 10px 0 0;
        color: var(--foreground-soft);
        line-height: 1.65;
      }

      .endpoint-list {
        border-top: 0.5px solid var(--border);
      }

      .endpoint-row {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
        gap: 18px;
        padding: 16px 0;
        border-bottom: 0.5px solid var(--border-soft);
      }

      .endpoint-path {
        font-size: 1.05rem;
        font-weight: 600;
      }

      .endpoint-copy {
        color: var(--foreground-soft);
        line-height: 1.55;
      }

      .totals-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-bottom: 20px;
      }

      .ipo-list {
        display: grid;
        gap: 0;
        border-top: 0.5px solid var(--border);
      }

      .ipo-row {
        padding: 20px 0;
        border-bottom: 0.5px solid var(--border-soft);
      }

      .ipo-row-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .ipo-title-group h3 {
        margin: 0;
        font-size: 1.9rem;
        line-height: 1.05;
      }

      .ipo-meta {
        margin: 10px 0 0;
        color: var(--foreground-muted);
        font-size: 0.98rem;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        border: 0.5px solid var(--border);
        border-radius: 999px;
        padding: 7px 12px;
        background: var(--pill-bg);
        color: var(--foreground-soft);
        font-size: 0.76rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .status-upcoming {
        background: #f5efe8;
      }

      .status-open {
        background: #efeee7;
      }

      .status-listed {
        background: #ecebe6;
      }

      .ipo-facts {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 16px;
        margin: 18px 0 0;
      }

      .ipo-facts div {
        min-width: 0;
      }

      .ipo-facts dd {
        margin: 8px 0 0;
        color: var(--foreground-soft);
        line-height: 1.55;
      }

      .prospectus-link {
        color: inherit;
        text-decoration: underline;
        text-decoration-thickness: 0.06em;
        text-underline-offset: 0.14em;
      }

      .muted,
      .empty-state {
        color: var(--foreground-muted);
      }

      .empty-state {
        padding: 18px 0 0;
        line-height: 1.65;
      }

      .site-footer {
        padding: 18px 20px 30px;
        border-top: 0.5px solid var(--border);
        color: var(--foreground-muted);
        font-size: 0.95rem;
        line-height: 1.6;
      }

      @media (max-width: 767px) {
        .page {
          padding: 0;
        }

        .site-header {
          flex-direction: column;
          align-items: stretch;
        }

        .primary-cta {
          width: 100%;
        }

        .hero {
          padding-top: 36px;
        }

        .hero-copy {
          font-size: 1rem;
        }

        .value-grid,
        .pulse-grid,
        .totals-grid,
        .ipo-facts,
        .endpoint-row {
          grid-template-columns: 1fr;
        }

        .value-card + .value-card,
        .pulse-card:nth-child(odd),
        .total-card + .total-card {
          border-left: 0;
          border-right: 0;
        }

        .value-card + .value-card,
        .pulse-card + .pulse-card,
        .total-card + .total-card {
          border-top: 0.5px solid var(--border);
        }

        .pulse-card:nth-child(-n + 2) {
          border-bottom: 0;
        }

        .ipo-row-head {
          flex-direction: column;
        }
      }

      @media (min-width: 768px) {
        .hero-copy {
          text-align: justify;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="frame">
        <header class="site-header">
          <div class="site-title-wrap">
            <a class="brand" href="/">HK IPO API</a>
            <p class="site-tagline">Hong Kong IPO data for the SwiftUI client and every downstream tool.</p>
          </div>
          <a class="primary-cta" href="/v2/ipos?limit=10">Open the live feed</a>
        </header>

        <main>
          <section class="hero section">
            <p class="hero-kicker">Cloudflare Worker · Hono · D1</p>
            <h1>Live market-ready IPO data.</h1>
            <p class="hero-copy">
              This service runs on Hono + Wrangler + D1, refreshes from Jina on a daily Cloudflare cron,
              and exposes the current Hong Kong IPO feed through a stable <code>/v2</code> API.
            </p>
          </section>

          <section class="value-grid">
            <article class="value-card">
              <h2>Fresh every day.</h2>
              <p>Subscription windows, listing dates, lot sizes, and price ranges are refreshed into the same production Worker that powers the app.</p>
            </article>
            <article class="value-card">
              <h2>One stable surface.</h2>
              <p>The root domain serves health checks, IPO lists, and per-code detail routes from a single <code>/v2</code> namespace.</p>
            </article>
            <article class="value-card">
              <h2>Built for reuse.</h2>
              <p>Use the feed in SwiftUI, internal tools, or lightweight automations without rebuilding the data pipeline for each client.</p>
            </article>
          </section>

          <section class="section">
            <div class="section-intro">
              <h2>Market pulse, from the production Worker.</h2>
              <p>The same D1-backed service health and sync state shown here are what the production clients see when they call into the API.</p>
            </div>

            <div class="pulse-grid">
              <article class="pulse-card">
                <span class="metric-label">Worker Status</span>
                <strong class="metric-value">${healthStatus}</strong>
                <p class="metric-copy">Service: ${escapeHtml(data.health.service)}</p>
              </article>
              <article class="pulse-card">
                <span class="metric-label">D1 Connectivity</span>
                <strong class="metric-value">${databaseStatus}</strong>
                <p class="metric-copy">Reads are served directly from the production D1 dataset.</p>
              </article>
              <article class="pulse-card">
                <span class="metric-label">Latest Sync</span>
                <strong class="metric-value">${escapeHtml(latestSyncStatus)}</strong>
                <p class="metric-copy">${escapeHtml(latestSyncTime)}</p>
              </article>
              <article class="pulse-card">
                <span class="metric-label">Run Summary</span>
                <strong class="metric-value">${latestSync ? String(latestSync.totalCount) : "0"} rows</strong>
                <p class="metric-copy">${escapeHtml(latestSyncSummary)}</p>
              </article>
            </div>
          </section>

          <section class="section">
            <div class="section-intro">
              <h2>Explore the production API.</h2>
              <p>Everything below stays under the same custom domain and mirrors the routes used by the app and any downstream integrations.</p>
            </div>

            <div class="endpoint-list">
              <a class="endpoint-row" href="/v2/health">
                <div>
                  <span class="endpoint-label">Endpoint</span>
                  <div class="endpoint-path">/v2/health</div>
                </div>
                <div class="endpoint-copy">Service and D1 health in one lightweight response.</div>
              </a>
              <a class="endpoint-row" href="/v2/ipos?limit=10">
                <div>
                  <span class="endpoint-label">Endpoint</span>
                  <div class="endpoint-path">/v2/ipos</div>
                </div>
                <div class="endpoint-copy">Filterable IPO records for timelines, dashboards, and app views.</div>
              </a>
              <a class="endpoint-row" href="/v2/ipos/stats">
                <div>
                  <span class="endpoint-label">Endpoint</span>
                  <div class="endpoint-path">/v2/ipos/stats</div>
                </div>
                <div class="endpoint-copy">Market counts plus the latest sync summary from the ingest pipeline.</div>
              </a>
              <a class="endpoint-row" href="/v2/ipos/02506">
                <div>
                  <span class="endpoint-label">Endpoint</span>
                  <div class="endpoint-path">/v2/ipos/:code</div>
                </div>
                <div class="endpoint-copy">Single IPO detail for on-demand drill-downs or focused app screens.</div>
              </a>
            </div>
          </section>

          <section class="section">
            <div class="section-intro">
              <h2>Recent IPO feed.</h2>
              <p>The latest ten IPO records below are served from the same D1 tables used by the SwiftUI app.</p>
            </div>

            <div class="totals-grid">
              <article class="total-card">
                <span>Upcoming</span>
                <strong>${data.stats.counts.upcoming}</strong>
              </article>
              <article class="total-card">
                <span>Open</span>
                <strong>${data.stats.counts.open}</strong>
              </article>
              <article class="total-card">
                <span>Listed</span>
                <strong>${data.stats.counts.listed}</strong>
              </article>
            </div>

            <div class="ipo-list">
              ${itemsMarkup}
            </div>
          </section>
        </main>

        <footer class="site-footer">
          HK IPO API is deployed on Cloudflare and exposes the production market feed through a stable, machine-readable <code>/v2</code> surface.
        </footer>
      </div>
    </div>
  </body>
</html>`;
}
