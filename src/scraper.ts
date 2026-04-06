import { cleanOptionalText, cleanRequiredText, joinOptionalText } from "./cleaning";
import { currentChinaDate, inferRecordYearContext, inferIPOStatus, normalizeChinaDate } from "./date";
import type { Env, ScrapedIPORecord } from "./types";

const JINA_URL = "https://r.jina.ai/https://www.jisilu.cn/data/new_stock/hkipo/";

interface JinaPayload {
  rows?: Array<{
    cell?: Record<string, unknown>;
  }>;
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
      const yearContext = inferRecordYearContext(cleanRequiredText(cell.apply_dt));
      const subStart = normalizeChinaDate(cleanRequiredText(cell.apply_dt), new Date(), yearContext);
      const subEnd = normalizeChinaDate(cleanRequiredText(cell.apply_end_dt), new Date(), yearContext);
      const listDate = normalizeChinaDate(cleanRequiredText(cell.list_dt), new Date(), yearContext);

      return {
        code: cleanRequiredText(cell.stock_cd),
        name: cleanRequiredText(cell.stock_nm),
        board: cleanRequiredText(cell.market),
        subStart,
        subEnd,
        listDate,
        status: inferIPOStatus({ subStart, listDate }, currentChinaDate()),
        priceRange: cleanOptionalText(cell.price_range),
        lotAmount: cleanOptionalText(cell.single_draw_money),
        lotWinRate: cleanOptionalText(cell.lucky_draw_rt),
        issuePrice: cleanOptionalText(cell.issue_price),
        issuePERatio: cleanOptionalText(cell.issue_pe_range),
        greenshoePublicOffer: joinOptionalText(cell.green_rt, cell.green_amount),
        comparableCompanies: cleanOptionalText(cell.ref_company),
        overSubMultiple: cleanOptionalText(cell.above_rt),
        totalFundRaising: cleanOptionalText(cell.raise_money),
        issueMarketCap: cleanOptionalText(cell.total_values),
        livermoreDarkPool: cleanOptionalText(cell.gray_incr_rt),
        futuDarkPool: cleanOptionalText(cell.gray_incr_rt2),
        firstDayChange: cleanOptionalText(cell.first_incr_rt),
        totalChange: cleanOptionalText(cell.total_incr_rt),
        underwriter: cleanOptionalText(cell.underwriter),
        prospectusUrl: cleanOptionalText(cell.prospectus)
      };
    })
    .filter((record) => record.code.length > 0 && record.name.length > 0);
}
