export type IPOStatus = "upcoming" | "open" | "listed";

export interface Env {
  HKIPO_DB: D1Database;
  CF_ACCOUNT_ID: string;
  JINA_KEY?: string;
}

export interface ScrapedIPORecord {
  code: string;
  name: string;
  board: string;
  subStart: string | null;
  subEnd: string | null;
  listDate: string | null;
  status: IPOStatus;
  priceRange: string | null;
  lotAmount: string | null;
  lotWinRate: string | null;
  issuePrice: string | null;
  issuePERatio: string | null;
  greenshoePublicOffer: string | null;
  comparableCompanies: string | null;
  overSubMultiple: string | null;
  totalFundRaising: string | null;
  issueMarketCap: string | null;
  livermoreDarkPool: string | null;
  futuDarkPool: string | null;
  firstDayChange: string | null;
  totalChange: string | null;
  underwriter: string | null;
  prospectusUrl: string | null;
}

export interface IPOListItem {
  code: string;
  name: string;
  subStart: string | null;
  subEnd: string | null;
  listDate: string | null;
  lotAmount: string;
  priceRange: string;
  prospectusUrl: string;
  status: IPOStatus;
  board: string;
}

export interface IPODetail extends IPOListItem {
  lotWinRate: string;
  issuePrice: string;
  issuePERatio: string;
  greenshoePublicOffer: string;
  comparableCompanies: string;
  overSubMultiple: string;
  totalFundRaising: string;
  issueMarketCap: string;
  livermoreDarkPool: string;
  futuDarkPool: string;
  firstDayChange: string;
  totalChange: string;
  underwriter: string;
  syncedAt: string;
}

export interface AllocationRow {
  id: number;
  newsId: string;
  pool: string;
  sharesApplied: number;
  validApplications: number;
  allocationText: string;
  successfulApplications: number | null;
  allottedSharesPerSuccessfulApplication: number | null;
  allottedPercentText: string;
  allottedRatio: number | null;
  rowOrder: number;
}

export interface AllocationChartPoint {
  sharesApplied: number;
  validApplications: number;
  allottedPercentText: string;
  rowOrder: number;
}

export interface AllocationChartPool {
  pool: string;
  points: AllocationChartPoint[];
}

export interface AllocationChartStock {
  stockCode: string;
  stockName: string;
  releaseTime: string;
  newsId: string;
  pools: AllocationChartPool[];
}

export interface SyncSummary {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  insertedCount: number;
  updatedCount: number;
  totalCount: number;
  errorMessage: string | null;
}

export type PublicSyncSummary = Omit<SyncSummary, "errorMessage">;

export interface IPOCounts {
  upcoming: number;
  open: number;
  listed: number;
}

export interface IPOStats {
  counts: IPOCounts;
  latestSync: SyncSummary | null;
}

export interface PublicIPOStats {
  counts: IPOCounts;
  latestSync: PublicSyncSummary | null;
}

export interface ServiceHealth {
  ok: boolean;
  service: string;
  database: "connected" | "disconnected";
}
