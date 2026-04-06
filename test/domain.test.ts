import test from "node:test";
import assert from "node:assert/strict";
import { buildListQuery } from "../src/repository";
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
