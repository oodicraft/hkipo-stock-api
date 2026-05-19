import type { AllocationChartPoint, AllocationChartPool, AllocationChartStock } from "./types";

interface ChartGeometry {
  svgWidth: number;
  svgHeight: number;
  plotWidth: number;
  plotHeight: number;
  left: number;
  top: number;
  barWidth: number;
  gap: number;
  baseline: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatShares(value: number): string {
  if (value >= 1_000_000) {
    return `${formatInteger(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${formatInteger(value / 1_000)}K`;
  }
  return formatInteger(value);
}

function formatPoolLabel(pool: string): string {
  return pool.trim().length > 0 ? `Pool ${pool}` : "Pool";
}

function chartGeometry(pointCount: number): ChartGeometry {
  const left = 72;
  const top = 34;
  const right = 28;
  const bottom = 88;
  const barWidth = 42;
  const gap = 22;
  const plotWidth = Math.max(520, pointCount * (barWidth + gap) - gap);
  const plotHeight = 240;
  const svgWidth = left + plotWidth + right;
  const svgHeight = top + plotHeight + bottom;

  return {
    svgWidth,
    svgHeight,
    plotWidth,
    plotHeight,
    left,
    top,
    barWidth,
    gap,
    baseline: top + plotHeight
  };
}

function renderYAxis(maxApplications: number, geometry: ChartGeometry): string {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return ticks
    .map((tick) => {
      const value = Math.round(maxApplications * tick);
      const y = geometry.baseline - geometry.plotHeight * tick;
      return `
        <g class="chart-y-tick">
          <line x1="${geometry.left}" y1="${y}" x2="${geometry.left + geometry.plotWidth}" y2="${y}" />
          <text x="${geometry.left - 12}" y="${y + 4}" text-anchor="end">${escapeHtml(formatInteger(value))}</text>
        </g>
      `;
    })
    .join("");
}

function renderBars(points: AllocationChartPoint[], geometry: ChartGeometry, maxApplications: number): string {
  return points
    .map((point, index) => {
      const height = maxApplications > 0 ? Math.max(2, (point.validApplications / maxApplications) * geometry.plotHeight) : 2;
      const x = geometry.left + index * (geometry.barWidth + geometry.gap);
      const y = geometry.baseline - height;
      const percentText = point.allottedPercentText.trim().length > 0 ? point.allottedPercentText : "N/A";
      const title = `${formatInteger(point.sharesApplied)} shares applied; ${formatInteger(point.validApplications)} applications; allotment ${percentText}`;

      return `
        <g class="chart-bar-group">
          <rect class="chart-bar" x="${x}" y="${y}" width="${geometry.barWidth}" height="${height}" rx="4">
            <title>${escapeHtml(title)}</title>
          </rect>
          <text class="chart-value" x="${x + geometry.barWidth / 2}" y="${Math.max(16, y - 8)}" text-anchor="middle">${escapeHtml(formatInteger(point.validApplications))}</text>
          <text class="chart-x-label" x="${x + geometry.barWidth / 2}" y="${geometry.baseline + 24}" text-anchor="end" transform="rotate(-42 ${x + geometry.barWidth / 2} ${geometry.baseline + 24})">${escapeHtml(formatShares(point.sharesApplied))}</text>
          <text class="chart-ratio" x="${x + geometry.barWidth / 2}" y="${geometry.baseline + 70}" text-anchor="middle">${escapeHtml(percentText)}</text>
        </g>
      `;
    })
    .join("");
}

function renderPoolChart(pool: AllocationChartPool): string {
  if (pool.points.length === 0) {
    return "";
  }

  const maxApplications = Math.max(...pool.points.map((point) => point.validApplications), 1);
  const geometry = chartGeometry(pool.points.length);

  return `
    <section class="pool-panel">
      <div class="pool-header">
        <h3>${escapeHtml(formatPoolLabel(pool.pool))}</h3>
        <span>${pool.points.length} rows</span>
      </div>
      <div class="chart-scroll" role="img" aria-label="${escapeHtml(formatPoolLabel(pool.pool))} allocation chart">
        <svg viewBox="0 0 ${geometry.svgWidth} ${geometry.svgHeight}" width="${geometry.svgWidth}" height="${geometry.svgHeight}" class="allocation-chart">
          <line class="chart-axis" x1="${geometry.left}" y1="${geometry.top}" x2="${geometry.left}" y2="${geometry.baseline}" />
          <line class="chart-axis" x1="${geometry.left}" y1="${geometry.baseline}" x2="${geometry.left + geometry.plotWidth}" y2="${geometry.baseline}" />
          ${renderYAxis(maxApplications, geometry)}
          ${renderBars(pool.points, geometry, maxApplications)}
          <text class="axis-label y-axis-label" x="18" y="${geometry.top + geometry.plotHeight / 2}" transform="rotate(-90 18 ${geometry.top + geometry.plotHeight / 2})" text-anchor="middle">Valid applications</text>
          <text class="axis-label x-axis-label" x="${geometry.left + geometry.plotWidth / 2}" y="${geometry.svgHeight - 12}" text-anchor="middle">Shares applied</text>
        </svg>
      </div>
    </section>
  `;
}

function renderStock(stock: AllocationChartStock): string {
  return `
    <article class="stock-section">
      <header class="stock-header">
        <div>
          <p class="stock-code">HK ${escapeHtml(stock.stockCode)}</p>
          <h2>${escapeHtml(stock.stockName)}</h2>
        </div>
        <dl class="stock-meta">
          <div>
            <dt>Release</dt>
            <dd>${escapeHtml(stock.releaseTime)}</dd>
          </div>
          <div>
            <dt>News ID</dt>
            <dd>${escapeHtml(stock.newsId)}</dd>
          </div>
        </dl>
      </header>
      <div class="pool-grid">
        ${stock.pools.map(renderPoolChart).join("")}
      </div>
    </article>
  `;
}

export function renderAllocationChartsPage(stocks: AllocationChartStock[]): string {
  const stockMarkup =
    stocks.length > 0
      ? stocks.map(renderStock).join("")
      : `<section class="empty-state">No allocation rows are available yet.</section>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Allocation Charts · HKIPO Stock api</title>
    <meta name="description" content="HKIPO allocation rows charted by stock, pool, shares applied, and valid applications." />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <style>
      :root {
        color-scheme: light;
        --background: #fbfaf7;
        --surface: #ffffff;
        --surface-alt: #f3f5f1;
        --foreground: #191b18;
        --foreground-soft: #4d554c;
        --foreground-muted: #788174;
        --border: rgba(25, 27, 24, 0.14);
        --border-strong: rgba(25, 27, 24, 0.26);
        --accent: #2f6f5e;
        --accent-dark: #1d4f43;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--background);
        color: var(--foreground);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      a {
        color: inherit;
      }

      .page {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 48px;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding-bottom: 22px;
        border-bottom: 1px solid var(--border-strong);
      }

      .brand-link {
        color: var(--foreground-soft);
        font-size: 0.95rem;
        text-decoration: none;
      }

      .hero {
        padding: 34px 0 28px;
      }

      .kicker,
      .stock-code,
      .pool-header span,
      .stock-meta dt {
        color: var(--foreground-muted);
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        margin-top: 10px;
        font-size: clamp(2.4rem, 7vw, 5.4rem);
        line-height: 0.95;
        font-weight: 720;
        max-width: 10ch;
      }

      .hero-copy {
        margin-top: 16px;
        max-width: 760px;
        color: var(--foreground-soft);
        font-size: 1.05rem;
        line-height: 1.7;
      }

      .stock-list {
        display: grid;
        gap: 22px;
      }

      .stock-section,
      .empty-state {
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
      }

      .stock-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        padding: 20px;
        border-bottom: 1px solid var(--border);
      }

      .stock-header h2 {
        margin-top: 6px;
        font-size: clamp(1.4rem, 3vw, 2.1rem);
        line-height: 1.15;
      }

      .stock-meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin: 0;
        min-width: min(420px, 100%);
      }

      .stock-meta div {
        min-width: 0;
      }

      .stock-meta dd {
        margin: 6px 0 0;
        color: var(--foreground-soft);
        overflow-wrap: anywhere;
      }

      .pool-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0;
      }

      .pool-panel {
        min-width: 0;
        padding: 18px;
      }

      .pool-panel + .pool-panel {
        border-left: 1px solid var(--border);
      }

      .pool-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 12px;
      }

      .pool-header h3 {
        font-size: 1rem;
        font-weight: 720;
      }

      .chart-scroll {
        overflow-x: auto;
        padding: 12px 8px 4px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface-alt);
      }

      .allocation-chart {
        display: block;
        max-width: none;
      }

      .chart-axis {
        stroke: var(--border-strong);
        stroke-width: 1;
      }

      .chart-y-tick line {
        stroke: rgba(25, 27, 24, 0.09);
        stroke-width: 1;
      }

      .chart-y-tick text,
      .axis-label,
      .chart-x-label,
      .chart-ratio {
        fill: var(--foreground-muted);
        font-size: 12px;
      }

      .axis-label {
        font-weight: 700;
      }

      .chart-bar {
        fill: var(--accent);
      }

      .chart-bar:hover {
        fill: var(--accent-dark);
      }

      .chart-value {
        fill: var(--foreground);
        font-size: 12px;
        font-weight: 700;
      }

      .chart-ratio {
        font-size: 11px;
      }

      .empty-state {
        padding: 28px;
        color: var(--foreground-soft);
        line-height: 1.6;
      }

      @media (max-width: 820px) {
        .page {
          width: min(100% - 20px, 1180px);
          padding-top: 18px;
        }

        .topbar,
        .stock-header {
          flex-direction: column;
        }

        .stock-meta,
        .pool-grid {
          grid-template-columns: 1fr;
        }

        .pool-panel + .pool-panel {
          border-left: 0;
          border-top: 1px solid var(--border);
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <nav class="topbar">
        <a class="brand-link" href="/">HKIPO Stock api</a>
        <a class="brand-link" href="/v2/ipos">API</a>
      </nav>
      <section class="hero">
        <p class="kicker">Allocation rows</p>
        <h1>Application demand by stock.</h1>
        <p class="hero-copy">Each chart uses the latest allocation document for a stock. Bars compare shares applied on the x-axis with valid applications on the y-axis, split by Pool A and Pool B.</p>
      </section>
      <section class="stock-list">
        ${stockMarkup}
      </section>
    </main>
  </body>
</html>`;
}
