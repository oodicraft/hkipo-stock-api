import { cleanOptionalText, cleanRequiredText } from "./cleaning";
import { currentChinaDate, inferRecordYearContext, inferIPOStatus, normalizeChinaDate } from "./date";
import type { ScrapedIPORecord } from "./types";

export interface JisiluJSONRow {
  code: string;
  name: string;
  listing_board?: string | null;
  subscription_start?: string | null;
  subscription_end?: string | null;
  listing_date?: string | null;
  price_range?: string | null;
  one_lot_cost?: string | null;
  one_lot_rate?: string | null;
  issue_price?: string | null;
  pe_ratio?: string | null;
  green_shoe?: string | null;
  comparable_company?: string | null;
  oversubscription?: string | null;
  total_raised_amount?: string | null;
  market_cap?: string | null;
  livermore_dark_change?: string | null;
  futu_dark_change?: string | null;
  first_day_change?: string | null;
  total_change?: string | null;
  sponsors?: string | null;
  prospectus_link?: string | null;
}

export function mapJisiluRowToRecord(row: JisiluJSONRow, today = new Date()): ScrapedIPORecord {
  const yearContext = inferRecordYearContext(row.subscription_start ?? null, today);
  const subStart = normalizeChinaDate(row.subscription_start ?? null, today, yearContext);
  const subEnd = normalizeChinaDate(row.subscription_end ?? null, today, yearContext);
  const listDate = normalizeChinaDate(row.listing_date ?? null, today, yearContext);

  return {
    code: cleanRequiredText(row.code),
    name: cleanRequiredText(row.name),
    board: cleanRequiredText(row.listing_board),
    subStart,
    subEnd,
    listDate,
    status: inferIPOStatus({ subStart, listDate }, currentChinaDate(today)),
    priceRange: cleanOptionalText(row.price_range),
    lotAmount: cleanOptionalText(row.one_lot_cost),
    lotWinRate: cleanOptionalText(row.one_lot_rate),
    issuePrice: cleanOptionalText(row.issue_price),
    issuePERatio: cleanOptionalText(row.pe_ratio),
    greenshoePublicOffer: cleanOptionalText(row.green_shoe),
    comparableCompanies: cleanOptionalText(row.comparable_company),
    overSubMultiple: cleanOptionalText(row.oversubscription),
    totalFundRaising: cleanOptionalText(row.total_raised_amount),
    issueMarketCap: cleanOptionalText(row.market_cap),
    livermoreDarkPool: cleanOptionalText(row.livermore_dark_change),
    futuDarkPool: cleanOptionalText(row.futu_dark_change),
    firstDayChange: cleanOptionalText(row.first_day_change),
    totalChange: cleanOptionalText(row.total_change),
    underwriter: cleanOptionalText(row.sponsors),
    prospectusUrl: cleanOptionalText(row.prospectus_link)
  };
}

export function mapJisiluRowsToRecords(rows: JisiluJSONRow[], today = new Date()): ScrapedIPORecord[] {
  return rows
    .map((row) => mapJisiluRowToRecord(row, today))
    .filter((record) => record.code.length > 0 && record.name.length > 0);
}
