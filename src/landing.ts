import landingContent from "./content.json" with { type: "json" };
import { PRIVACY_POLICY_PATH } from "./site";
import type { IPOListItem, IPOStats, ServiceHealth } from "./types";

interface LandingPageData {
  health: ServiceHealth;
  stats: IPOStats;
  latestItems: IPOListItem[];
}

type InlineTextPart = {
  type: "text" | "code";
  value: string;
};

type CountKey = keyof IPOStats["counts"];

interface LandingContent {
  meta: {
    lang: string;
    title: string;
    description: string;
  };
  siteHeader: {
    brand: string;
    tagline: string;
    primaryCta: {
      href: string;
      label: string;
    };
  };
  hero: {
    kicker: string;
    title: string;
    copy: InlineTextPart[];
  };
  valueCards: Array<{
    title: string;
    copy: InlineTextPart[];
  }>;
  marketPulse: {
    title: string;
    description: string;
    cards: {
      workerStatus: {
        label: string;
        servicePrefix: string;
      };
      database: {
        label: string;
        copy: string;
      };
      latestSync: {
        label: string;
      };
      runSummary: {
        label: string;
        rowsSuffix: string;
      };
    };
  };
  endpoints: {
    title: string;
    description: string;
    label: string;
    items: Array<{
      href: string;
      path: string;
      copy: string;
    }>;
  };
  recentFeed: {
    title: string;
    description: string;
    totals: Array<{
      key: CountKey;
      label: string;
    }>;
    emptyState: string;
  };
  itemRow: {
    codePrefix: string;
    statusLabels: {
      open: string;
      listed: string;
      upcoming: string;
    };
    facts: {
      subscribe: string;
      list: string;
      lot: string;
      price: string;
      docs: string;
    };
    fallbacks: {
      value: string;
      board: string;
      empty: string;
      prospectusUnavailable: string;
    };
    prospectusLinkLabel: string;
  };
  status: {
    health: {
      operational: string;
      degraded: string;
    };
    database: {
      connected: string;
      disconnected: string;
    };
    syncFallbacks: {
      status: string;
      time: string;
      summary: string;
    };
    syncSummary: {
      rows: string;
      inserted: string;
      updated: string;
    };
  };
  footer: {
    copy: InlineTextPart[];
  };
}

const content = landingContent as LandingContent;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatValue(value: string | null, fallback = content.itemRow.fallbacks.value): string {
  return value && value.trim().length > 0 ? escapeHtml(value) : escapeHtml(fallback);
}

function statusLabel(status: IPOListItem["status"]): string {
  if (status === "open") {
    return content.itemRow.statusLabels.open;
  }
  if (status === "listed") {
    return content.itemRow.statusLabels.listed;
  }
  return content.itemRow.statusLabels.upcoming;
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
    ? `<a class="prospectus-link" href="${escapeHtml(item.prospectusUrl)}" target="_blank" rel="noreferrer">${escapeHtml(content.itemRow.prospectusLinkLabel)}</a>`
    : `<span class="muted">${escapeHtml(content.itemRow.fallbacks.prospectusUnavailable)}</span>`;

  return `
    <article class="ipo-row">
      <div class="ipo-row-head">
        <div class="ipo-title-group">
          <h3>${escapeHtml(item.name)}</h3>
          <p class="ipo-meta">${escapeHtml(content.itemRow.codePrefix)}${escapeHtml(item.code)} · ${formatValue(item.board, content.itemRow.fallbacks.board)}</p>
        </div>
        <span class="status-pill ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
      </div>
      <dl class="ipo-facts">
        <div>
          <dt>${escapeHtml(content.itemRow.facts.subscribe)}</dt>
          <dd>${formatValue(item.subStart, content.itemRow.fallbacks.value)} → ${formatValue(item.subEnd, content.itemRow.fallbacks.value)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(content.itemRow.facts.list)}</dt>
          <dd>${formatValue(item.listDate, content.itemRow.fallbacks.value)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(content.itemRow.facts.lot)}</dt>
          <dd>${formatValue(item.lotAmount, content.itemRow.fallbacks.empty)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(content.itemRow.facts.price)}</dt>
          <dd>${formatValue(item.priceRange, content.itemRow.fallbacks.empty)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(content.itemRow.facts.docs)}</dt>
          <dd>${prospectus}</dd>
        </div>
      </dl>
    </article>
  `;
}

function renderInlineText(parts: InlineTextPart[]): string {
  return parts
    .map((part) => (part.type === "code" ? `<code>${escapeHtml(part.value)}</code>` : escapeHtml(part.value)))
    .join("");
}

function renderValueCards(): string {
  return content.valueCards
    .map(
      (card) => `
            <article class="value-card">
              <h2>${escapeHtml(card.title)}</h2>
              <p>${renderInlineText(card.copy)}</p>
            </article>
          `
    )
    .join("");
}

function renderEndpointRows(): string {
  return content.endpoints.items
    .map(
      (item) => `
              <a class="endpoint-row" href="${escapeHtml(item.href)}">
                <div>
                  <span class="endpoint-label">${escapeHtml(content.endpoints.label)}</span>
                  <div class="endpoint-path">${escapeHtml(item.path)}</div>
                </div>
                <div class="endpoint-copy">${escapeHtml(item.copy)}</div>
              </a>
            `
    )
    .join("");
}

function renderTotals(stats: IPOStats): string {
  return content.recentFeed.totals
    .map(
      (total) => `
              <article class="total-card">
                <span>${escapeHtml(total.label)}</span>
                <strong>${stats.counts[total.key]}</strong>
              </article>
            `
    )
    .join("");
}

export function renderLandingPage(data: LandingPageData): string {
  const latestSync = data.stats.latestSync;
  const latestSyncStatus = latestSync ? latestSync.status : content.status.syncFallbacks.status;
  const latestSyncTime = latestSync?.finishedAt ?? latestSync?.startedAt ?? content.status.syncFallbacks.time;
  const latestSyncSummary = latestSync
    ? `${latestSync.totalCount}${content.status.syncSummary.rows} · ${latestSync.insertedCount}${content.status.syncSummary.inserted} · ${latestSync.updatedCount}${content.status.syncSummary.updated}`
    : content.status.syncFallbacks.summary;
  const healthStatus = data.health.ok ? content.status.health.operational : content.status.health.degraded;
  const databaseStatus =
    data.health.database === "connected" ? content.status.database.connected : content.status.database.disconnected;

  const itemsMarkup =
    data.latestItems.length > 0
      ? data.latestItems.map(renderItemRow).join("")
      : `<div class="empty-state">${escapeHtml(content.recentFeed.emptyState)}</div>`;

  return `<!doctype html>
<html lang="${escapeHtml(content.meta.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(content.meta.title)}</title>
    <meta
      name="description"
      content="${escapeHtml(content.meta.description)}"
    />
    <link rel="icon" href="/favicon.ico" sizes="any" />
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
            <a class="brand" href="/">${escapeHtml(content.siteHeader.brand)}</a>
            <p class="site-tagline">${escapeHtml(content.siteHeader.tagline)}</p>
          </div>
          <a class="primary-cta" href="${escapeHtml(content.siteHeader.primaryCta.href)}">${escapeHtml(content.siteHeader.primaryCta.label)}</a>
        </header>

        <main>
          <section class="hero section">
            <p class="hero-kicker">${escapeHtml(content.hero.kicker)}</p>
            <h1>${escapeHtml(content.hero.title)}</h1>
            <p class="hero-copy">${renderInlineText(content.hero.copy)}</p>
          </section>

          <section class="value-grid">
            ${renderValueCards()}
          </section>

          <section class="section">
            <div class="section-intro">
              <h2>${escapeHtml(content.marketPulse.title)}</h2>
              <p>${escapeHtml(content.marketPulse.description)}</p>
            </div>

            <div class="pulse-grid">
              <article class="pulse-card">
                <span class="metric-label">${escapeHtml(content.marketPulse.cards.workerStatus.label)}</span>
                <strong class="metric-value">${healthStatus}</strong>
                <p class="metric-copy">${escapeHtml(content.marketPulse.cards.workerStatus.servicePrefix)}${escapeHtml(data.health.service)}</p>
              </article>
              <article class="pulse-card">
                <span class="metric-label">${escapeHtml(content.marketPulse.cards.database.label)}</span>
                <strong class="metric-value">${databaseStatus}</strong>
                <p class="metric-copy">${escapeHtml(content.marketPulse.cards.database.copy)}</p>
              </article>
              <article class="pulse-card">
                <span class="metric-label">${escapeHtml(content.marketPulse.cards.latestSync.label)}</span>
                <strong class="metric-value">${escapeHtml(latestSyncStatus)}</strong>
                <p class="metric-copy">${escapeHtml(latestSyncTime)}</p>
              </article>
              <article class="pulse-card">
                <span class="metric-label">${escapeHtml(content.marketPulse.cards.runSummary.label)}</span>
                <strong class="metric-value">${latestSync ? String(latestSync.totalCount) : "0"}${escapeHtml(content.marketPulse.cards.runSummary.rowsSuffix)}</strong>
                <p class="metric-copy">${escapeHtml(latestSyncSummary)}</p>
              </article>
            </div>
          </section>

          <section class="section">
            <div class="section-intro">
              <h2>${escapeHtml(content.endpoints.title)}</h2>
              <p>${escapeHtml(content.endpoints.description)}</p>
            </div>

            <div class="endpoint-list">
              ${renderEndpointRows()}
            </div>
          </section>

          <section class="section">
            <div class="section-intro">
              <h2>${escapeHtml(content.recentFeed.title)}</h2>
              <p>${escapeHtml(content.recentFeed.description)}</p>
            </div>

            <div class="totals-grid">
              ${renderTotals(data.stats)}
            </div>

            <div class="ipo-list">
              ${itemsMarkup}
            </div>
          </section>
        </main>

        <footer class="site-footer">
          ${renderInlineText(content.footer.copy)} · <a href="${PRIVACY_POLICY_PATH}">Privacy Policy</a>
        </footer>
      </div>
    </div>
  </body>
</html>`;
}
