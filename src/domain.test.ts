import test from "node:test";
import assert from "node:assert/strict";
import { buildListQuery } from "./repository";
import { inferIPOStatus, normalizeChinaDate } from "./date";

test("normalizeChinaDate picks the closest year around today", () => {
  const today = new Date("2026-01-03T12:00:00+08:00");
  assert.equal(normalizeChinaDate("12-31(周三)", today), "2025-12-31");
  assert.equal(normalizeChinaDate("01-08", today), "2026-01-08");
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
