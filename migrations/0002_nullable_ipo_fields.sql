CREATE TABLE IF NOT EXISTS ipo_current_new (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    board TEXT NOT NULL DEFAULT '',
    sub_start TEXT,
    sub_end TEXT,
    list_date TEXT,
    status TEXT NOT NULL,
    price_range TEXT,
    lot_amount TEXT,
    lot_win_rate TEXT,
    issue_price TEXT,
    issue_pe_ratio TEXT,
    greenshoe_public_offer TEXT,
    comparable_companies TEXT,
    over_sub_multiple TEXT,
    total_fund_raising TEXT,
    issue_market_cap TEXT,
    livermore_dark_pool TEXT,
    futu_dark_pool TEXT,
    first_day_change TEXT,
    total_change TEXT,
    underwriter TEXT,
    prospectus_url TEXT,
    synced_at TEXT NOT NULL,
    sync_run_id TEXT NOT NULL REFERENCES sync_run(id)
);

INSERT INTO ipo_current_new (
    code, name, board, sub_start, sub_end, list_date, status, price_range, lot_amount,
    lot_win_rate, issue_price, issue_pe_ratio, greenshoe_public_offer, comparable_companies,
    over_sub_multiple, total_fund_raising, issue_market_cap, livermore_dark_pool,
    futu_dark_pool, first_day_change, total_change, underwriter, prospectus_url,
    synced_at, sync_run_id
)
SELECT
    code, name, board, sub_start, sub_end, list_date, status, price_range, lot_amount,
    lot_win_rate, issue_price, issue_pe_ratio, greenshoe_public_offer, comparable_companies,
    over_sub_multiple, total_fund_raising, issue_market_cap, livermore_dark_pool,
    futu_dark_pool, first_day_change, total_change, underwriter, prospectus_url,
    synced_at, sync_run_id
FROM ipo_current;

DROP TABLE ipo_current;
ALTER TABLE ipo_current_new RENAME TO ipo_current;

CREATE INDEX IF NOT EXISTS idx_ipo_current_status ON ipo_current(status);
CREATE INDEX IF NOT EXISTS idx_ipo_current_sub_start ON ipo_current(sub_start DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_current_list_date ON ipo_current(list_date DESC);

CREATE TABLE IF NOT EXISTS ipo_snapshot_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_run_id TEXT NOT NULL REFERENCES sync_run(id),
    snapshot_date TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    board TEXT NOT NULL DEFAULT '',
    sub_start TEXT,
    sub_end TEXT,
    list_date TEXT,
    status TEXT NOT NULL,
    price_range TEXT,
    lot_amount TEXT,
    lot_win_rate TEXT,
    issue_price TEXT,
    issue_pe_ratio TEXT,
    greenshoe_public_offer TEXT,
    comparable_companies TEXT,
    over_sub_multiple TEXT,
    total_fund_raising TEXT,
    issue_market_cap TEXT,
    livermore_dark_pool TEXT,
    futu_dark_pool TEXT,
    first_day_change TEXT,
    total_change TEXT,
    underwriter TEXT,
    prospectus_url TEXT,
    created_at TEXT NOT NULL
);

INSERT INTO ipo_snapshot_new (
    id, sync_run_id, snapshot_date, code, name, board, sub_start, sub_end, list_date, status,
    price_range, lot_amount, lot_win_rate, issue_price, issue_pe_ratio, greenshoe_public_offer,
    comparable_companies, over_sub_multiple, total_fund_raising, issue_market_cap,
    livermore_dark_pool, futu_dark_pool, first_day_change, total_change, underwriter,
    prospectus_url, created_at
)
SELECT
    id, sync_run_id, snapshot_date, code, name, board, sub_start, sub_end, list_date, status,
    price_range, lot_amount, lot_win_rate, issue_price, issue_pe_ratio, greenshoe_public_offer,
    comparable_companies, over_sub_multiple, total_fund_raising, issue_market_cap,
    livermore_dark_pool, futu_dark_pool, first_day_change, total_change, underwriter,
    prospectus_url, created_at
FROM ipo_snapshot;

DROP TABLE ipo_snapshot;
ALTER TABLE ipo_snapshot_new RENAME TO ipo_snapshot;

CREATE INDEX IF NOT EXISTS idx_ipo_snapshot_sync_run_id ON ipo_snapshot(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_ipo_snapshot_snapshot_date ON ipo_snapshot(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_snapshot_code ON ipo_snapshot(code);
