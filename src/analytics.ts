import { currentChinaDate, nowInChinaISOString } from "./date";
import type { Env } from "./types";

export const ANALYTICS_CLIENT_PATH = "/v2/analytics/client";
export const ANALYTICS_CRON = "17 * * * *";
export const MACOS_SERVICE_KEY = "hkipo-swiftui-macos";
export const WEB_SERVICE_KEY = "hkipo-backend-web";
const ANALYTICS_SQL_WINDOW_DAYS = 90;
const RETENTION_RETURN_DAYS = [1, 7, 30] as const;

type ClientEventName = "app_active" | "user_data_saved";
type AnalyticsEventName = ClientEventName | "page_view";
type ActorKind = "install" | "visitor";
type AnalyticsMetricName = "dau" | "user_data_saved";

export interface ClientAnalyticsPayload {
  event: ClientEventName;
  installId: string;
  occurredAt: string;
  appVersion: string;
  platform: string;
  code?: string;
}

interface AnalyticsDataPoint {
  serviceKey: string;
  eventName: AnalyticsEventName;
  actorKind: ActorKind;
  actorIdHash: string;
  platform: string;
  pageKey: string;
  itemCode: string;
  appVersion: string;
  eventDate: string;
  environment: string;
  eventTimestampMs: number;
}

interface AppActiveEventRow {
  actorIdHash: string;
  eventDate: string;
  appVersion: string;
  lastEventAt: string;
}

interface AggregatedEventRow {
  metricDate: string;
  actorIdHash: string;
  eventCount: number;
}

interface AggregatedPageRow {
  metricDate: string;
  pageKey: string;
  actorIdHash: string;
  viewCount: number;
}

interface InstallSnapshotRow {
  serviceKey: string;
  installIdHash: string;
  firstSeenDate: string;
  lastSeenDate: string;
  firstAppVersion: string;
  lastAppVersion: string;
}

interface DailyInstallActivityRow {
  serviceKey: string;
  installIdHash: string;
  activityDate: string;
  lastEventAt: string;
  sourceEvent: ClientEventName;
}

interface DailyMetricRow {
  serviceKey: string;
  metricDate: string;
  metricName: AnalyticsMetricName;
  eventCount: number;
  uniqueActorCount: number;
}

interface DailyPageSummaryRow {
  serviceKey: string;
  pageKey: string;
  metricDate: string;
  viewCount: number;
  uniqueVisitorCount: number;
}

interface RetentionInstallRow {
  installIdHash: string;
  firstSeenDate: string;
}

interface RetentionActivityRow {
  installIdHash: string;
  activityDate: string;
}

interface RetentionSummaryRow {
  serviceKey: string;
  cohortDate: string;
  returnDay: number;
  cohortSize: number;
  retainedCount: number;
  retentionRate: number;
}

type AnalyticsQueryExecutor = <TRow>(env: Env, query: string) => Promise<TRow[]>;

function createChinaDateFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function dateToChinaISO(date: Date): string {
  return createChinaDateFormatter().format(date);
}

function shiftChinaISODate(value: string, deltaDays: number): string {
  const anchor = new Date(`${value}T00:00:00+08:00`);
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  return dateToChinaISO(anchor);
}

function clampText(value: string | undefined, fallback = ""): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function inferEnvironment(request: Request): string {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "development" : "production";
}

function assertClientPayload(value: unknown): ClientAnalyticsPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid analytics payload");
  }

  const payload = value as Record<string, unknown>;
  const event = payload.event;
  if (event !== "app_active" && event !== "user_data_saved") {
    throw new Error("Unsupported analytics event");
  }

  const platform = clampText(typeof payload.platform === "string" ? payload.platform : undefined);
  if (platform !== "macos") {
    throw new Error("Unsupported analytics platform");
  }

  const installId = clampText(typeof payload.installId === "string" ? payload.installId : undefined);
  if (!installId) {
    throw new Error("Missing installId");
  }

  const occurredAt = clampText(typeof payload.occurredAt === "string" ? payload.occurredAt : undefined);
  const eventTimestampMs = Date.parse(occurredAt);
  if (!Number.isFinite(eventTimestampMs)) {
    throw new Error("Invalid occurredAt");
  }

  const appVersion = clampText(typeof payload.appVersion === "string" ? payload.appVersion : undefined);
  if (!appVersion) {
    throw new Error("Missing appVersion");
  }

  const code = typeof payload.code === "string" ? clampText(payload.code) : undefined;
  if (event === "user_data_saved" && !code) {
    throw new Error("Missing code");
  }

  return {
    event,
    installId,
    occurredAt,
    appVersion,
    platform,
    code
  };
}

function toAnalyticsDate(occurredAt: string): string {
  return currentChinaDate(new Date(occurredAt));
}

function toAnalyticsTimestampMs(occurredAt: string): number {
  return Date.parse(occurredAt);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

async function hashIdentity(parts: string[]): Promise<string> {
  return sha256Hex(parts.join("::"));
}

function writeAnalyticsDataPoint(env: Env, point: AnalyticsDataPoint) {
  env.ANALYTICS.writeDataPoint({
    indexes: [point.serviceKey],
    blobs: [
      point.eventName,
      point.actorKind,
      point.actorIdHash,
      point.platform,
      point.pageKey,
      point.itemCode,
      point.appVersion,
      point.eventDate,
      point.environment
    ],
    doubles: [point.eventTimestampMs, 1]
  });
}

function hasAnalyticsWriteBindings(env: Partial<Env>): env is Env {
  return Boolean(env.ANALYTICS && env.ANALYTICS_SALT);
}

export async function trackLandingPageView(env: Partial<Env>, request: Request): Promise<void> {
  if (!hasAnalyticsWriteBindings(env)) {
    return;
  }

  const ip = clampText(request.headers.get("CF-Connecting-IP") ?? undefined);
  const userAgent = clampText(request.headers.get("user-agent") ?? undefined);
  if (!ip && !userAgent) {
    return;
  }

  const today = currentChinaDate();
  const actorIdHash = await hashIdentity([ip, userAgent, today, env.ANALYTICS_SALT]);
  writeAnalyticsDataPoint(env, {
    serviceKey: WEB_SERVICE_KEY,
    eventName: "page_view",
    actorKind: "visitor",
    actorIdHash,
    platform: "web",
    pageKey: "landing",
    itemCode: "",
    appVersion: "",
    eventDate: today,
    environment: inferEnvironment(request),
    eventTimestampMs: Date.now()
  });
}

export async function ingestClientAnalyticsPayload(env: Partial<Env>, request: Request, payload: unknown): Promise<void> {
  if (!hasAnalyticsWriteBindings(env)) {
    throw new Error("Analytics binding is not configured");
  }

  if (new URL(request.url).protocol !== "https:") {
    throw new Error("Analytics endpoint requires HTTPS");
  }

  const body = assertClientPayload(payload);
  const actorIdHash = await hashIdentity([body.installId, env.ANALYTICS_SALT]);

  writeAnalyticsDataPoint(env, {
    serviceKey: MACOS_SERVICE_KEY,
    eventName: body.event,
    actorKind: "install",
    actorIdHash,
    platform: body.platform,
    pageKey: "",
    itemCode: clampText(body.code),
    appVersion: body.appVersion,
    eventDate: toAnalyticsDate(body.occurredAt),
    environment: inferEnvironment(request),
    eventTimestampMs: toAnalyticsTimestampMs(body.occurredAt)
  });
}

async function queryAnalyticsEngine<TRow>(env: Env, query: string): Promise<TRow[]> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`,
      "Content-Type": "text/plain"
    },
    body: query
  });

  if (!response.ok) {
    throw new Error(`Analytics SQL query failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { data?: TRow[] };
  return body.data ?? [];
}

function toSQLDateRange(now = new Date()): { startDate: string; endDate: string } | null {
  const today = currentChinaDate(now);
  const endDate = shiftChinaISODate(today, -1);
  if (endDate >= today) {
    return null;
  }

  return {
    startDate: shiftChinaISODate(today, -(ANALYTICS_SQL_WINDOW_DAYS - 1)),
    endDate
  };
}

function buildMacOSAppActiveQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      blob3 AS actorIdHash,
      blob8 AS eventDate,
      blob7 AS appVersion,
      MAX(timestamp) AS lastEventAt
    FROM ANALYTICS
    WHERE
      index1 = '${MACOS_SERVICE_KEY}'
      AND blob1 = 'app_active'
      AND blob8 >= '${startDate}'
      AND blob8 <= '${endDate}'
    GROUP BY actorIdHash, eventDate, appVersion
    ORDER BY actorIdHash ASC, eventDate ASC
  `;
}

function buildMacOSSaveQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      blob8 AS metricDate,
      blob3 AS actorIdHash,
      SUM(_sample_interval) AS eventCount
    FROM ANALYTICS
    WHERE
      index1 = '${MACOS_SERVICE_KEY}'
      AND blob1 = 'user_data_saved'
      AND blob8 >= '${startDate}'
      AND blob8 <= '${endDate}'
    GROUP BY metricDate, actorIdHash
    ORDER BY metricDate ASC, actorIdHash ASC
  `;
}

function buildLandingPageQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      blob8 AS metricDate,
      blob5 AS pageKey,
      blob3 AS actorIdHash,
      SUM(_sample_interval) AS viewCount
    FROM ANALYTICS
    WHERE
      index1 = '${WEB_SERVICE_KEY}'
      AND blob1 = 'page_view'
      AND blob8 >= '${startDate}'
      AND blob8 <= '${endDate}'
    GROUP BY metricDate, pageKey, actorIdHash
    ORDER BY metricDate ASC, pageKey ASC, actorIdHash ASC
  `;
}

function normalizeAppActiveRows(rows: AppActiveEventRow[]): AppActiveEventRow[] {
  const grouped = new Map<string, AppActiveEventRow>();

  for (const row of rows) {
    const actorIdHash = clampText(row.actorIdHash);
    const eventDate = clampText(row.eventDate);
    if (!actorIdHash || !eventDate) {
      continue;
    }

    const key = `${actorIdHash}:${eventDate}`;
    const normalizedRow: AppActiveEventRow = {
      actorIdHash,
      eventDate,
      appVersion: clampText(row.appVersion),
      lastEventAt: clampText(row.lastEventAt, nowInChinaISOString())
    };

    const existing = grouped.get(key);
    if (!existing || normalizedRow.lastEventAt >= existing.lastEventAt) {
      grouped.set(key, normalizedRow);
    }
  }

  return [...grouped.values()].sort((lhs, rhs) =>
    lhs.actorIdHash.localeCompare(rhs.actorIdHash) || lhs.eventDate.localeCompare(rhs.eventDate)
  );
}

function buildInstallSnapshots(rows: AppActiveEventRow[]): {
  installs: InstallSnapshotRow[];
  activities: DailyInstallActivityRow[];
  metrics: DailyMetricRow[];
} {
  const normalizedRows = normalizeAppActiveRows(rows);
  const installsByActor = new Map<string, InstallSnapshotRow>();
  const activities: DailyInstallActivityRow[] = [];
  const metricAccumulator = new Map<string, { events: number; actors: Set<string> }>();

  for (const row of normalizedRows) {
    activities.push({
      serviceKey: MACOS_SERVICE_KEY,
      installIdHash: row.actorIdHash,
      activityDate: row.eventDate,
      lastEventAt: row.lastEventAt,
      sourceEvent: "app_active"
    });

    const existing = installsByActor.get(row.actorIdHash);
    if (!existing) {
      installsByActor.set(row.actorIdHash, {
        serviceKey: MACOS_SERVICE_KEY,
        installIdHash: row.actorIdHash,
        firstSeenDate: row.eventDate,
        lastSeenDate: row.eventDate,
        firstAppVersion: row.appVersion,
        lastAppVersion: row.appVersion
      });
    } else {
      if (row.eventDate < existing.firstSeenDate) {
        existing.firstSeenDate = row.eventDate;
        existing.firstAppVersion = row.appVersion;
      }
      if (row.eventDate >= existing.lastSeenDate) {
        existing.lastSeenDate = row.eventDate;
        existing.lastAppVersion = row.appVersion;
      }
    }

    const metricState = metricAccumulator.get(row.eventDate) ?? { events: 0, actors: new Set<string>() };
    metricState.events += 1;
    metricState.actors.add(row.actorIdHash);
    metricAccumulator.set(row.eventDate, metricState);
  }

  const metrics = [...metricAccumulator.entries()].map(([metricDate, state]) => ({
    serviceKey: MACOS_SERVICE_KEY,
    metricDate,
    metricName: "dau" as const,
    eventCount: state.events,
    uniqueActorCount: state.actors.size
  }));

  return {
    installs: [...installsByActor.values()],
    activities,
    metrics: metrics.sort((lhs, rhs) => lhs.metricDate.localeCompare(rhs.metricDate))
  };
}

function buildSaveMetrics(rows: AggregatedEventRow[]): DailyMetricRow[] {
  const metricsByDate = new Map<string, { eventCount: number; actors: Set<string> }>();

  for (const row of rows) {
    const metricDate = clampText(row.metricDate);
    const actorIdHash = clampText(row.actorIdHash);
    if (!metricDate || !actorIdHash) {
      continue;
    }

    const metricState = metricsByDate.get(metricDate) ?? { eventCount: 0, actors: new Set<string>() };
    metricState.eventCount += Number(row.eventCount ?? 0);
    metricState.actors.add(actorIdHash);
    metricsByDate.set(metricDate, metricState);
  }

  return [...metricsByDate.entries()]
    .map(([metricDate, state]) => ({
      serviceKey: MACOS_SERVICE_KEY,
      metricDate,
      metricName: "user_data_saved" as const,
      eventCount: state.eventCount,
      uniqueActorCount: state.actors.size
    }))
    .sort((lhs, rhs) => lhs.metricDate.localeCompare(rhs.metricDate));
}

function buildPageSummaries(rows: AggregatedPageRow[]): DailyPageSummaryRow[] {
  const summaries = new Map<string, { pageKey: string; viewCount: number; actors: Set<string> }>();

  for (const row of rows) {
    const metricDate = clampText(row.metricDate);
    const pageKey = clampText(row.pageKey, "landing");
    const actorIdHash = clampText(row.actorIdHash);
    if (!metricDate || !actorIdHash) {
      continue;
    }

    const key = `${metricDate}:${pageKey}`;
    const summary = summaries.get(key) ?? { pageKey, viewCount: 0, actors: new Set<string>() };
    summary.viewCount += Number(row.viewCount ?? 0);
    summary.actors.add(actorIdHash);
    summaries.set(key, summary);
  }

  return [...summaries.entries()]
    .map(([key, summary]) => {
      const [metricDate] = key.split(":");
      return {
        serviceKey: WEB_SERVICE_KEY,
        pageKey: summary.pageKey,
        metricDate,
        viewCount: summary.viewCount,
        uniqueVisitorCount: summary.actors.size
      };
    })
    .sort((lhs, rhs) => lhs.metricDate.localeCompare(rhs.metricDate) || lhs.pageKey.localeCompare(rhs.pageKey));
}

export function computeRetentionRows(
  installs: RetentionInstallRow[],
  activities: RetentionActivityRow[],
  asOfDate: string,
  serviceKey = MACOS_SERVICE_KEY
): RetentionSummaryRow[] {
  const activitySet = new Set(activities.map((row) => `${row.installIdHash}:${row.activityDate}`));
  const results: RetentionSummaryRow[] = [];

  for (const returnDay of RETENTION_RETURN_DAYS) {
    const cohorts = new Map<string, { cohortSize: number; retainedCount: number }>();

    for (const install of installs) {
      if (shiftChinaISODate(install.firstSeenDate, returnDay) > asOfDate) {
        continue;
      }

      const state = cohorts.get(install.firstSeenDate) ?? { cohortSize: 0, retainedCount: 0 };
      state.cohortSize += 1;
      if (activitySet.has(`${install.installIdHash}:${shiftChinaISODate(install.firstSeenDate, returnDay)}`)) {
        state.retainedCount += 1;
      }
      cohorts.set(install.firstSeenDate, state);
    }

    for (const [cohortDate, summary] of cohorts.entries()) {
      results.push({
        serviceKey,
        cohortDate,
        returnDay,
        cohortSize: summary.cohortSize,
        retainedCount: summary.retainedCount,
        retentionRate: summary.cohortSize > 0 ? Number((summary.retainedCount / summary.cohortSize).toFixed(4)) : 0
      });
    }
  }

  return results.sort((lhs, rhs) => lhs.cohortDate.localeCompare(rhs.cohortDate) || lhs.returnDay - rhs.returnDay);
}

async function seedAnalyticsServices(env: Env) {
  const now = nowInChinaISOString();
  await env.ANALYTICS_DB.batch([
    env.ANALYTICS_DB
      .prepare(`
        INSERT INTO analytics_service (service_key, display_name, platform, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(service_key) DO UPDATE SET
          display_name = excluded.display_name,
          platform = excluded.platform
      `)
      .bind(MACOS_SERVICE_KEY, "HOOOK macOS", "macos", now),
    env.ANALYTICS_DB
      .prepare(`
        INSERT INTO analytics_service (service_key, display_name, platform, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(service_key) DO UPDATE SET
          display_name = excluded.display_name,
          platform = excluded.platform
      `)
      .bind(WEB_SERVICE_KEY, "HOOOK Landing Page", "web", now)
  ]);
}

async function upsertInstalls(env: Env, rows: InstallSnapshotRow[]) {
  if (rows.length === 0) {
    return;
  }

  const now = nowInChinaISOString();
  const statements = rows.map((row) =>
    env.ANALYTICS_DB
      .prepare(`
        INSERT INTO analytics_install (
          service_key, install_id_hash, first_seen_date, last_seen_date,
          first_app_version, last_app_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(service_key, install_id_hash) DO UPDATE SET
          first_seen_date = CASE
            WHEN excluded.first_seen_date < analytics_install.first_seen_date THEN excluded.first_seen_date
            ELSE analytics_install.first_seen_date
          END,
          last_seen_date = CASE
            WHEN excluded.last_seen_date > analytics_install.last_seen_date THEN excluded.last_seen_date
            ELSE analytics_install.last_seen_date
          END,
          first_app_version = CASE
            WHEN excluded.first_seen_date < analytics_install.first_seen_date THEN excluded.first_app_version
            ELSE analytics_install.first_app_version
          END,
          last_app_version = CASE
            WHEN excluded.last_seen_date >= analytics_install.last_seen_date THEN excluded.last_app_version
            ELSE analytics_install.last_app_version
          END,
          updated_at = excluded.updated_at
      `)
      .bind(
        row.serviceKey,
        row.installIdHash,
        row.firstSeenDate,
        row.lastSeenDate,
        row.firstAppVersion,
        row.lastAppVersion,
        now,
        now
      )
  );

  await env.ANALYTICS_DB.batch(statements);
}

async function upsertActivities(env: Env, rows: DailyInstallActivityRow[]) {
  if (rows.length === 0) {
    return;
  }

  const statements = rows.map((row) =>
    env.ANALYTICS_DB
      .prepare(`
        INSERT INTO analytics_daily_install_activity (
          service_key, install_id_hash, activity_date, last_event_at, source_event
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(service_key, install_id_hash, activity_date) DO UPDATE SET
          last_event_at = CASE
            WHEN excluded.last_event_at > analytics_daily_install_activity.last_event_at THEN excluded.last_event_at
            ELSE analytics_daily_install_activity.last_event_at
          END,
          source_event = excluded.source_event
      `)
      .bind(row.serviceKey, row.installIdHash, row.activityDate, row.lastEventAt, row.sourceEvent)
  );

  await env.ANALYTICS_DB.batch(statements);
}

async function replaceDailyMetrics(env: Env, rows: DailyMetricRow[]) {
  if (rows.length === 0) {
    return;
  }

  const now = nowInChinaISOString();
  const statements = rows.map((row) =>
    env.ANALYTICS_DB
      .prepare(`
        INSERT INTO analytics_daily_metric (
          service_key, metric_date, metric_name, event_count, unique_actor_count, computed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(service_key, metric_date, metric_name) DO UPDATE SET
          event_count = excluded.event_count,
          unique_actor_count = excluded.unique_actor_count,
          computed_at = excluded.computed_at
      `)
      .bind(row.serviceKey, row.metricDate, row.metricName, row.eventCount, row.uniqueActorCount, now)
  );

  await env.ANALYTICS_DB.batch(statements);
}

async function replaceDailyPages(env: Env, rows: DailyPageSummaryRow[]) {
  if (rows.length === 0) {
    return;
  }

  const now = nowInChinaISOString();
  const statements = rows.map((row) =>
    env.ANALYTICS_DB
      .prepare(`
        INSERT INTO analytics_daily_page (
          service_key, page_key, metric_date, view_count, unique_visitor_count, computed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(service_key, page_key, metric_date) DO UPDATE SET
          view_count = excluded.view_count,
          unique_visitor_count = excluded.unique_visitor_count,
          computed_at = excluded.computed_at
      `)
      .bind(row.serviceKey, row.pageKey, row.metricDate, row.viewCount, row.uniqueVisitorCount, now)
  );

  await env.ANALYTICS_DB.batch(statements);
}

async function fetchRetentionInputs(env: Env, asOfDate: string): Promise<{
  installs: RetentionInstallRow[];
  activities: RetentionActivityRow[];
}> {
  const startDate = shiftChinaISODate(asOfDate, -(ANALYTICS_SQL_WINDOW_DAYS - 1));
  const [installsResult, activitiesResult] = await Promise.all([
    env.ANALYTICS_DB
      .prepare(`
        SELECT install_id_hash AS installIdHash, first_seen_date AS firstSeenDate
        FROM analytics_install
        WHERE service_key = ? AND first_seen_date >= ? AND first_seen_date <= ?
      `)
      .bind(MACOS_SERVICE_KEY, startDate, asOfDate)
      .all<RetentionInstallRow>(),
    env.ANALYTICS_DB
      .prepare(`
        SELECT install_id_hash AS installIdHash, activity_date AS activityDate
        FROM analytics_daily_install_activity
        WHERE service_key = ? AND activity_date >= ? AND activity_date <= ?
      `)
      .bind(MACOS_SERVICE_KEY, startDate, asOfDate)
      .all<RetentionActivityRow>()
  ]);

  return {
    installs: installsResult.results ?? [],
    activities: activitiesResult.results ?? []
  };
}

async function replaceRetentionRows(env: Env, rows: RetentionSummaryRow[]) {
  if (rows.length === 0) {
    return;
  }

  const now = nowInChinaISOString();
  const statements = rows.map((row) =>
    env.ANALYTICS_DB
      .prepare(`
        INSERT INTO analytics_daily_retention (
          service_key, cohort_date, return_day, cohort_size, retained_count, retention_rate, computed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(service_key, cohort_date, return_day) DO UPDATE SET
          cohort_size = excluded.cohort_size,
          retained_count = excluded.retained_count,
          retention_rate = excluded.retention_rate,
          computed_at = excluded.computed_at
      `)
      .bind(
        row.serviceKey,
        row.cohortDate,
        row.returnDay,
        row.cohortSize,
        row.retainedCount,
        row.retentionRate,
        now
      )
  );

  await env.ANALYTICS_DB.batch(statements);
}

function hasAnalyticsQueryBindings(env: Partial<Env>): env is Env {
  return Boolean(env.ANALYTICS_DB && env.CF_ACCOUNT_ID && env.CF_ANALYTICS_API_TOKEN);
}

export async function runAnalyticsAggregation(
  env: Partial<Env>,
  now = new Date(),
  queryExecutor: AnalyticsQueryExecutor = queryAnalyticsEngine
): Promise<void> {
  if (!hasAnalyticsQueryBindings(env)) {
    return;
  }

  const dateRange = toSQLDateRange(now);
  if (!dateRange) {
    return;
  }

  await seedAnalyticsServices(env);

  const [appActiveRows, saveRows, pageRows] = await Promise.all([
    queryExecutor<AppActiveEventRow>(env, buildMacOSAppActiveQuery(dateRange.startDate, dateRange.endDate)),
    queryExecutor<AggregatedEventRow>(env, buildMacOSSaveQuery(dateRange.startDate, dateRange.endDate)),
    queryExecutor<AggregatedPageRow>(env, buildLandingPageQuery(dateRange.startDate, dateRange.endDate))
  ]);

  const installSnapshot = buildInstallSnapshots(appActiveRows);
  await upsertInstalls(env, installSnapshot.installs);
  await upsertActivities(env, installSnapshot.activities);
  await replaceDailyMetrics(env, [...installSnapshot.metrics, ...buildSaveMetrics(saveRows)]);
  await replaceDailyPages(env, buildPageSummaries(pageRows));

  const retentionInputs = await fetchRetentionInputs(env, dateRange.endDate);
  await replaceRetentionRows(env, computeRetentionRows(retentionInputs.installs, retentionInputs.activities, dateRange.endDate));
}

export const analyticsTestExports = {
  buildInstallSnapshots,
  buildPageSummaries,
  buildSaveMetrics,
  normalizeAppActiveRows,
  shiftChinaISODate,
  toSQLDateRange
};
