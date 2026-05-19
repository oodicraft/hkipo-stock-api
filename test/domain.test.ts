import test from "node:test";
import assert from "node:assert/strict";
import { buildAllocationRowsByCodeQuery, buildLatestAllocationChartStocksQuery, buildListQuery, normalizeStockCode } from "../src/repository";
import { cleanOptionalText } from "../src/cleaning";
import { inferIPOStatus, inferRecordYearContext, normalizeChinaDate } from "../src/date";

test("inferRecordYearContext rolls future sub start into previous year", () => {
  const today = new Date("2026-04-06T12:00:00+08:00");
  assert.equal(inferRecordYearContext("09-30", today), 2025);
  assert.equal(inferRecordYearContext("03-30", today), 2026);
});

test("inferIPOStatus transitions by sub start and list date", () => {
  assert.equal(
    inferIPOStatus({ subStart: "2026-04-10", listDate: "2026-04-18" }, "2026-04-01"),
    "upcoming"
  );
  assert.equal(
    inferIPOStatus({ subStart: "2026-04-10", listDate: "2026-04-18" }, "2026-04-12"),
    "open"
  );
  assert.equal(
    inferIPOStatus({ subStart: "2026-04-10", listDate: "2026-04-18" }, "2026-04-18"),
    "listed"
  );
});

test("normalizeChinaDate reuses the same year context for related fields", () => {
  const today = new Date("2026-04-06T12:00:00+08:00");
  const yearContext = inferRecordYearContext("09-30", today);

  assert.equal(normalizeChinaDate("09-30", today, yearContext), "2025-09-30");
  assert.equal(normalizeChinaDate("10-06", today, yearContext), "2025-10-06");
  assert.equal(normalizeChinaDate("10-10", today, yearContext), "2025-10-10");
});

test("cleanOptionalText turns member-gated text into null", () => {
  assert.equal(cleanOptionalText("仅会员可见"), null);
  assert.equal(cleanOptionalText("https://www.jisilu.cn/setting/member/"), null);
  assert.equal(cleanOptionalText("正常值"), "正常值");
});

test("buildListQuery includes status, keyword and date filters", () => {
  const { sql, params } = buildListQuery({
    status: "open",
    q: "宁德",
    from: "2026-04-01",
    to: "2026-04-30",
    limit: 50,
    offset: 10
  });

  assert.match(sql, /status = \?/);
  assert.match(sql, /code LIKE \? OR name LIKE \?/);
  assert.match(sql, /sub_start >= \?/);
  assert.match(sql, /sub_start <= \?/);
  assert.deepEqual(params, ["open", "%宁德%", "%宁德%", "2026-04-01", "2026-04-30", 50, 10]);
});

test("normalizeStockCode trims and pads stock codes to five digits", () => {
  assert.equal(normalizeStockCode("1236"), "01236");
  assert.equal(normalizeStockCode(" 01236 "), "01236");
});

test("buildAllocationRowsByCodeQuery joins documents and filters by stock code", () => {
  const { sql, params } = buildAllocationRowsByCodeQuery("1236");

  assert.match(sql, /FROM allocation_rows r/);
  assert.match(sql, /INNER JOIN documents d ON d\.news_id = r\.news_id/);
  assert.match(sql, /WHERE d\.stock_code = \?/);
  assert.match(sql, /ORDER BY d\.release_time DESC, r\.row_order ASC, r\.id ASC/);
  assert.deepEqual(params, ["01236"]);
});

test("buildLatestAllocationChartStocksQuery selects latest allocation document per stock", () => {
  const { sql, params } = buildLatestAllocationChartStocksQuery();

  assert.match(sql, /FROM documents d/);
  assert.match(sql, /FROM allocation_rows existing_rows/);
  assert.match(sql, /INNER JOIN allocation_rows r ON r\.news_id = latest_documents\.news_id/);
  assert.match(sql, /ROW_NUMBER\(\) OVER \(/);
  assert.match(sql, /PARTITION BY d\.stock_code/);
  assert.match(sql, /WHERE latest_documents\.stock_document_rank = 1/);
  assert.match(sql, /ORDER BY[\s\S]*latest_documents\.stock_code ASC, r\.pool ASC, r\.shares_applied ASC/);
  assert.deepEqual(params, []);
});
