import { currentChinaDate, nowInChinaISOString } from "./date";
import type {
  AllocationChartStock,
  AllocationRow,
  Env,
  IPODetail,
  IPOListItem,
  IPOStats,
  ScrapedIPORecord,
  ServiceHealth,
  SyncSummary
} from "./types";

export interface ListQuery {
  status?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
  from?: string | null;
  to?: string | null;
}

function mapListItem(row: Record<string, unknown>): IPOListItem {
  return {
    code: String(row.code),
    name: String(row.name),
    subStart: row.sub_start ? String(row.sub_start) : null,
    subEnd: row.sub_end ? String(row.sub_end) : null,
    listDate: row.list_date ? String(row.list_date) : null,
    lotAmount: String(row.lot_amount ?? ""),
    priceRange: String(row.price_range ?? ""),
    prospectusUrl: String(row.prospectus_url ?? ""),
    status: String(row.status) as IPOListItem["status"],
    board: String(row.board ?? "")
  };
}

function mapDetail(row: Record<string, unknown>): IPODetail {
  const base = mapListItem(row);
  return {
    ...base,
    lotWinRate: String(row.lot_win_rate ?? ""),
    issuePrice: String(row.issue_price ?? ""),
    issuePERatio: String(row.issue_pe_ratio ?? ""),
    greenshoePublicOffer: String(row.greenshoe_public_offer ?? ""),
    comparableCompanies: String(row.comparable_companies ?? ""),
    overSubMultiple: String(row.over_sub_multiple ?? ""),
    totalFundRaising: String(row.total_fund_raising ?? ""),
    issueMarketCap: String(row.issue_market_cap ?? ""),
    livermoreDarkPool: String(row.livermore_dark_pool ?? ""),
    futuDarkPool: String(row.futu_dark_pool ?? ""),
    firstDayChange: String(row.first_day_change ?? ""),
    totalChange: String(row.total_change ?? ""),
    underwriter: String(row.underwriter ?? ""),
    syncedAt: String(row.synced_at ?? "")
  };
}

function mapAllocationRow(row: Record<string, unknown>): AllocationRow {
  return {
    id: Number(row.id),
    newsId: String(row.news_id),
    pool: String(row.pool),
    sharesApplied: Number(row.shares_applied),
    validApplications: Number(row.valid_applications),
    allocationText: String(row.allocation_text),
    successfulApplications: row.successful_applications === null || row.successful_applications === undefined ? null : Number(row.successful_applications),
    allottedSharesPerSuccessfulApplication:
      row.allotted_shares_per_successful_application === null || row.allotted_shares_per_successful_application === undefined
        ? null
        : Number(row.allotted_shares_per_successful_application),
    allottedPercentText: String(row.allotted_percent_text),
    allottedRatio: row.allotted_ratio === null || row.allotted_ratio === undefined ? null : Number(row.allotted_ratio),
    rowOrder: Number(row.row_order)
  };
}

function mapAllocationChartStocks(rows: Record<string, unknown>[]): AllocationChartStock[] {
  const stocks: AllocationChartStock[] = [];
  const stocksByNewsId = new Map<string, AllocationChartStock>();

  for (const row of rows) {
    const newsId = String(row.news_id);
    let stock = stocksByNewsId.get(newsId);
    if (!stock) {
      stock = {
        stockCode: String(row.stock_code),
        stockName: String(row.stock_name),
        releaseTime: String(row.release_time),
        newsId,
        pools: []
      };
      stocksByNewsId.set(newsId, stock);
      stocks.push(stock);
    }

    const poolName = String(row.pool);
    let pool = stock.pools.find((candidate) => candidate.pool === poolName);
    if (!pool) {
      pool = {
        pool: poolName,
        points: []
      };
      stock.pools.push(pool);
    }

    pool.points.push({
      sharesApplied: Number(row.shares_applied),
      validApplications: Number(row.valid_applications),
      allottedPercentText: String(row.allotted_percent_text),
      rowOrder: Number(row.row_order)
    });
  }

  return stocks;
}

export function normalizeStockCode(code: string): string {
  return code.trim().padStart(5, "0");
}

function releaseTimeSortExpression(alias: string): string {
  return `
    substr(${alias}.release_time, 7, 4) || '-' ||
    substr(${alias}.release_time, 4, 2) || '-' ||
    substr(${alias}.release_time, 1, 2) || ' ' ||
    substr(${alias}.release_time, 12, 5)
  `;
}

function normalizeLimit(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 100;
  }
  return Math.max(1, Math.min(500, value));
}

function normalizeOffset(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, value);
}

export function buildListQuery(query: ListQuery): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.status && query.status !== "all") {
    conditions.push("status = ?");
    params.push(query.status);
  }

  if (query.q) {
    conditions.push("(code LIKE ? OR name LIKE ?)");
    params.push(`%${query.q}%`, `%${query.q}%`);
  }

  if (query.from) {
    conditions.push("(sub_start IS NOT NULL AND sub_start >= ?)");
    params.push(query.from);
  }

  if (query.to) {
    conditions.push("(sub_start IS NOT NULL AND sub_start <= ?)");
    params.push(query.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);

  return {
    sql: `
      SELECT code, name, board, sub_start, sub_end, list_date, lot_amount, price_range, prospectus_url, status
      FROM ipo_current
      ${whereClause}
      ORDER BY sub_start DESC, code ASC
      LIMIT ? OFFSET ?
    `,
    params: [...params, limit, offset]
  };
}

export function buildAllocationRowsByCodeQuery(code: string): { sql: string; params: unknown[] } {
  return {
    sql: `
      SELECT
        r.id,
        r.news_id,
        r.pool,
        r.shares_applied,
        r.valid_applications,
        r.allocation_text,
        r.successful_applications,
        r.allotted_shares_per_successful_application,
        r.allotted_percent_text,
        r.allotted_ratio,
        r.row_order
      FROM allocation_rows r
      INNER JOIN documents d ON d.news_id = r.news_id
      WHERE d.stock_code = ?
      ORDER BY d.release_time DESC, r.row_order ASC, r.id ASC
    `,
    params: [normalizeStockCode(code)]
  };
}

export function buildLatestAllocationChartStocksQuery(): { sql: string; params: unknown[] } {
  const releaseSort = releaseTimeSortExpression("d");
  const latestReleaseSort = releaseTimeSortExpression("latest_documents");

  return {
    sql: `
      WITH latest_documents AS (
        SELECT
          d.news_id,
          d.stock_code,
          d.stock_name,
          d.release_time,
          ROW_NUMBER() OVER (
            PARTITION BY d.stock_code
            ORDER BY ${releaseSort} DESC, d.news_id DESC
          ) AS stock_document_rank
        FROM documents d
        WHERE EXISTS (
          SELECT 1
          FROM allocation_rows existing_rows
          WHERE existing_rows.news_id = d.news_id
        )
      )
      SELECT
        latest_documents.news_id,
        latest_documents.stock_code,
        latest_documents.stock_name,
        latest_documents.release_time,
        r.pool,
        r.shares_applied,
        r.valid_applications,
        r.allotted_percent_text,
        r.row_order
      FROM latest_documents
      INNER JOIN allocation_rows r ON r.news_id = latest_documents.news_id
      WHERE latest_documents.stock_document_rank = 1
      ORDER BY ${latestReleaseSort} DESC, latest_documents.stock_code ASC, r.pool ASC, r.shares_applied ASC
    `,
    params: []
  };
}

export async function upsertCurrentAndArchive(env: Env, records: ScrapedIPORecord[]): Promise<SyncSummary> {
  const startedAt = nowInChinaISOString();
  const syncRunId = crypto.randomUUID();
  const syncedAt = nowInChinaISOString();
  const snapshotDate = currentChinaDate();

  await env.HKIPO_DB
    .prepare(`
      INSERT INTO sync_run (id, started_at, status)
      VALUES (?, ?, ?)
    `)
    .bind(syncRunId, startedAt, "running")
    .run();

  let insertedCount = 0;
  let updatedCount = 0;

  try {
    for (const record of records) {
      const existing = await env.HKIPO_DB
        .prepare("SELECT code FROM ipo_current WHERE code = ?")
        .bind(record.code)
        .first();

      if (existing) {
        updatedCount += 1;
      } else {
        insertedCount += 1;
      }

      await env.HKIPO_DB
        .prepare(`
          INSERT INTO ipo_current (
            code, name, board, sub_start, sub_end, list_date, status, price_range, lot_amount,
            lot_win_rate, issue_price, issue_pe_ratio, greenshoe_public_offer, comparable_companies,
            over_sub_multiple, total_fund_raising, issue_market_cap, livermore_dark_pool,
            futu_dark_pool, first_day_change, total_change, underwriter, prospectus_url,
            synced_at, sync_run_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(code) DO UPDATE SET
            name = excluded.name,
            board = excluded.board,
            sub_start = excluded.sub_start,
            sub_end = excluded.sub_end,
            list_date = excluded.list_date,
            status = excluded.status,
            price_range = excluded.price_range,
            lot_amount = excluded.lot_amount,
            lot_win_rate = excluded.lot_win_rate,
            issue_price = excluded.issue_price,
            issue_pe_ratio = excluded.issue_pe_ratio,
            greenshoe_public_offer = excluded.greenshoe_public_offer,
            comparable_companies = excluded.comparable_companies,
            over_sub_multiple = excluded.over_sub_multiple,
            total_fund_raising = excluded.total_fund_raising,
            issue_market_cap = excluded.issue_market_cap,
            livermore_dark_pool = excluded.livermore_dark_pool,
            futu_dark_pool = excluded.futu_dark_pool,
            first_day_change = excluded.first_day_change,
            total_change = excluded.total_change,
            underwriter = excluded.underwriter,
            prospectus_url = excluded.prospectus_url,
            synced_at = excluded.synced_at,
            sync_run_id = excluded.sync_run_id
        `)
        .bind(
          record.code,
          record.name,
          record.board,
          record.subStart,
          record.subEnd,
          record.listDate,
          record.status,
          record.priceRange,
          record.lotAmount,
          record.lotWinRate,
          record.issuePrice,
          record.issuePERatio,
          record.greenshoePublicOffer,
          record.comparableCompanies,
          record.overSubMultiple,
          record.totalFundRaising,
          record.issueMarketCap,
          record.livermoreDarkPool,
          record.futuDarkPool,
          record.firstDayChange,
          record.totalChange,
          record.underwriter,
          record.prospectusUrl,
          syncedAt,
          syncRunId
        )
        .run();

      await env.HKIPO_DB
        .prepare(`
          INSERT INTO ipo_snapshot (
            sync_run_id, snapshot_date, code, name, board, sub_start, sub_end, list_date, status,
            price_range, lot_amount, lot_win_rate, issue_price, issue_pe_ratio, greenshoe_public_offer,
            comparable_companies, over_sub_multiple, total_fund_raising, issue_market_cap,
            livermore_dark_pool, futu_dark_pool, first_day_change, total_change, underwriter,
            prospectus_url, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          syncRunId,
          snapshotDate,
          record.code,
          record.name,
          record.board,
          record.subStart,
          record.subEnd,
          record.listDate,
          record.status,
          record.priceRange,
          record.lotAmount,
          record.lotWinRate,
          record.issuePrice,
          record.issuePERatio,
          record.greenshoePublicOffer,
          record.comparableCompanies,
          record.overSubMultiple,
          record.totalFundRaising,
          record.issueMarketCap,
          record.livermoreDarkPool,
          record.futuDarkPool,
          record.firstDayChange,
          record.totalChange,
          record.underwriter,
          record.prospectusUrl,
          syncedAt
        )
        .run();
    }

    const finishedAt = nowInChinaISOString();
    await env.HKIPO_DB
      .prepare(`
        UPDATE sync_run
        SET finished_at = ?, status = ?, inserted_count = ?, updated_count = ?, total_count = ?, error_message = NULL
        WHERE id = ?
      `)
      .bind(finishedAt, "success", insertedCount, updatedCount, records.length, syncRunId)
      .run();

    return {
      id: syncRunId,
      startedAt,
      finishedAt,
      status: "success",
      insertedCount,
      updatedCount,
      totalCount: records.length,
      errorMessage: null
    };
  } catch (error) {
    const finishedAt = nowInChinaISOString();
    const errorMessage = error instanceof Error ? error.message : "Unknown sync error";
    await env.HKIPO_DB
      .prepare(`
        UPDATE sync_run
        SET finished_at = ?, status = ?, inserted_count = ?, updated_count = ?, total_count = ?, error_message = ?
        WHERE id = ?
      `)
      .bind(finishedAt, "failed", insertedCount, updatedCount, records.length, errorMessage, syncRunId)
      .run();

    throw error;
  }
}

export async function listIPOs(env: Env, query: ListQuery): Promise<IPOListItem[]> {
  const statement = buildListQuery(query);
  const result = await env.HKIPO_DB.prepare(statement.sql).bind(...statement.params).all<Record<string, unknown>>();
  return (result.results ?? []).map(mapListItem);
}

export async function getIPODetail(env: Env, code: string): Promise<IPODetail | null> {
  const result = await env.HKIPO_DB
    .prepare(`
      SELECT *
      FROM ipo_current
      WHERE code = ?
      LIMIT 1
    `)
    .bind(code)
    .first<Record<string, unknown>>();

  return result ? mapDetail(result) : null;
}

export async function getAllocationRowsByCode(env: Env, code: string): Promise<AllocationRow[]> {
  const statement = buildAllocationRowsByCodeQuery(code);
  const result = await env.HKIPO_DB.prepare(statement.sql).bind(...statement.params).all<Record<string, unknown>>();
  return (result.results ?? []).map(mapAllocationRow);
}

export async function getLatestAllocationChartStocks(env: Env): Promise<AllocationChartStock[]> {
  const statement = buildLatestAllocationChartStocksQuery();
  const result = await env.HKIPO_DB.prepare(statement.sql).bind(...statement.params).all<Record<string, unknown>>();
  return mapAllocationChartStocks(result.results ?? []);
}

export async function getLatestSyncSummary(env: Env): Promise<SyncSummary | null> {
  const result = await env.HKIPO_DB
    .prepare(`
      SELECT id, started_at, finished_at, status, inserted_count, updated_count, total_count, error_message
      FROM sync_run
      ORDER BY started_at DESC
      LIMIT 1
    `)
    .first<Record<string, unknown>>();

  if (!result) {
    return null;
  }

  return {
    id: String(result.id),
    startedAt: String(result.started_at),
    finishedAt: result.finished_at ? String(result.finished_at) : null,
    status: String(result.status),
    insertedCount: Number(result.inserted_count ?? 0),
    updatedCount: Number(result.updated_count ?? 0),
    totalCount: Number(result.total_count ?? 0),
    errorMessage: result.error_message ? String(result.error_message) : null
  };
}

export async function getIPOStats(env: Env): Promise<IPOStats> {
  const countsResult = await env.HKIPO_DB
    .prepare(`
      SELECT status, COUNT(*) AS count
      FROM ipo_current
      GROUP BY status
    `)
    .all<Record<string, unknown>>();

  const counts = {
    upcoming: 0,
    open: 0,
    listed: 0
  };

  for (const row of countsResult.results ?? []) {
    const status = String(row.status);
    const count = Number(row.count ?? 0);
    if (status === "upcoming" || status === "open" || status === "listed") {
      counts[status] = count;
    }
  }

  return {
    counts,
    latestSync: await getLatestSyncSummary(env)
  };
}

export async function getServiceHealth(env: Env): Promise<ServiceHealth> {
  const result = await env.HKIPO_DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return {
    ok: result?.ok === 1,
    service: "hkipo-stock-api",
    database: result?.ok === 1 ? "connected" : "disconnected"
  };
}

export async function getLatestIPOItems(env: Env, limit = 10): Promise<IPOListItem[]> {
  return listIPOs(env, { limit, offset: 0, status: "all" });
}
