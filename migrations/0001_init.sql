CREATE TABLE IF NOT EXISTS sync_run (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS ipo_current (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    board TEXT NOT NULL DEFAULT '',
    sub_start TEXT,
    sub_end TEXT,
    list_date TEXT,
    status TEXT NOT NULL,
    price_range TEXT NOT NULL DEFAULT '',
    lot_amount TEXT NOT NULL DEFAULT '',
    lot_win_rate TEXT NOT NULL DEFAULT '',
    issue_price TEXT NOT NULL DEFAULT '',
    issue_pe_ratio TEXT NOT NULL DEFAULT '',
    greenshoe_public_offer TEXT NOT NULL DEFAULT '',
    comparable_companies TEXT NOT NULL DEFAULT '',
    over_sub_multiple TEXT NOT NULL DEFAULT '',
    total_fund_raising TEXT NOT NULL DEFAULT '',
    issue_market_cap TEXT NOT NULL DEFAULT '',
    livermore_dark_pool TEXT NOT NULL DEFAULT '',
    futu_dark_pool TEXT NOT NULL DEFAULT '',
    first_day_change TEXT NOT NULL DEFAULT '',
    total_change TEXT NOT NULL DEFAULT '',
    underwriter TEXT NOT NULL DEFAULT '',
    prospectus_url TEXT NOT NULL DEFAULT '',
    synced_at TEXT NOT NULL,
    sync_run_id TEXT NOT NULL REFERENCES sync_run(id)
);

CREATE INDEX IF NOT EXISTS idx_ipo_current_status ON ipo_current(status);
CREATE INDEX IF NOT EXISTS idx_ipo_current_sub_start ON ipo_current(sub_start DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_current_list_date ON ipo_current(list_date DESC);

CREATE TABLE IF NOT EXISTS ipo_snapshot (
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
    price_range TEXT NOT NULL DEFAULT '',
    lot_amount TEXT NOT NULL DEFAULT '',
    lot_win_rate TEXT NOT NULL DEFAULT '',
    issue_price TEXT NOT NULL DEFAULT '',
    issue_pe_ratio TEXT NOT NULL DEFAULT '',
    greenshoe_public_offer TEXT NOT NULL DEFAULT '',
    comparable_companies TEXT NOT NULL DEFAULT '',
    over_sub_multiple TEXT NOT NULL DEFAULT '',
    total_fund_raising TEXT NOT NULL DEFAULT '',
    issue_market_cap TEXT NOT NULL DEFAULT '',
    livermore_dark_pool TEXT NOT NULL DEFAULT '',
    futu_dark_pool TEXT NOT NULL DEFAULT '',
    first_day_change TEXT NOT NULL DEFAULT '',
    total_change TEXT NOT NULL DEFAULT '',
    underwriter TEXT NOT NULL DEFAULT '',
    prospectus_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ipo_snapshot_sync_run_id ON ipo_snapshot(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_ipo_snapshot_snapshot_date ON ipo_snapshot(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_snapshot_code ON ipo_snapshot(code);
