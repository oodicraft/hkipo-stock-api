import { normalizeChinaDate, inferIPOStatus } from "./date";
import type { Env, ScrapedIPORecord } from "./types";

const JINA_URL = "https://r.jina.ai/https://www.jisilu.cn/data/new_stock/hkipo/";

interface JinaPayload {
  rows?: Array<{
    cell?: Record<string, unknown>;
  }>;
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();
  if (text === "None") {
    return "";
  }

  return text;
}

function extractPayload(markdown: string): JinaPayload {
  const match = markdown.match(/(\{.*"page":.*\})/s);
  if (!match) {
    throw new Error("Could not find JSON payload in Jina response.");
  }

  const rawJson = match[1].replace(/\]\(https:\/\/[^)]+\)/g, "");
  return JSON.parse(rawJson) as JinaPayload;
}

export async function fetchAndParseIPOData(env: Env): Promise<ScrapedIPORecord[]> {
  const headers = new Headers({
    "X-Return-Format": "markdown"
  });

  if (env.JINA_KEY) {
    headers.set("Authorization", `Bearer ${env.JINA_KEY}`);
  }

  const response = await fetch(JINA_URL, {
    method: "GET",
    headers
  });

  if (!response.ok) {
    throw new Error(`Jina request failed with status ${response.status}`);
  }

  const payload = extractPayload(await response.text());
  const rows = payload.rows ?? [];

  return rows
    .map((row) => row.cell ?? {})
    .map((cell): ScrapedIPORecord => {
      const subStart = normalizeChinaDate(cleanText(cell.apply_dt));
      const subEnd = normalizeChinaDate(cleanText(cell.apply_end_dt));
      const listDate = normalizeChinaDate(cleanText(cell.list_dt));

      return {
        code: cleanText(cell.stock_cd),
        name: cleanText(cell.stock_nm),
        board: cleanText(cell.market),
        subStart,
        subEnd,
        listDate,
        status: inferIPOStatus({ subStart, listDate }),
        priceRange: cleanText(cell.price_range),
        lotAmount: cleanText(cell.single_draw_money),
        lotWinRate: cleanText(cell.lucky_draw_rt),
        issuePrice: cleanText(cell.issue_price),
        issuePERatio: cleanText(cell.issue_pe_range),
        greenshoePublicOffer: `${cleanText(cell.green_rt)} ${cleanText(cell.green_amount)}`.trim(),
        comparableCompanies: cleanText(cell.ref_company),
        overSubMultiple: cleanText(cell.above_rt),
        totalFundRaising: cleanText(cell.raise_money),
        issueMarketCap: cleanText(cell.total_values),
        livermoreDarkPool: cleanText(cell.gray_incr_rt),
        futuDarkPool: cleanText(cell.gray_incr_rt2),
        firstDayChange: cleanText(cell.first_incr_rt),
        totalChange: cleanText(cell.total_incr_rt),
        underwriter: cleanText(cell.underwriter),
        prospectusUrl: cleanText(cell.prospectus)
      };
    })
    .filter((record) => record.code.length > 0 && record.name.length > 0);
}
