import { currentChinaDate, nowInChinaISOString } from "./date";
import type { Env, IPODetail, IPOListItem, IPOStats, ScrapedIPORecord, ServiceHealth, SyncSummary } from "./types";

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
