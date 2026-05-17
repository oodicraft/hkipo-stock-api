CREATE TABLE IF NOT EXISTS documents (
    news_id TEXT PRIMARY KEY,
    stock_code TEXT NOT NULL REFERENCES ipo_current(code),
    stock_name TEXT NOT NULL,
    title TEXT NOT NULL,
    release_time TEXT NOT NULL,
    file_info TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_url TEXT NOT NULL,
    local_pdf_path TEXT NOT NULL,
    downloaded_at TEXT,
    processed_at TEXT,
    extraction_method TEXT,
    raw_text TEXT,
    parse_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_release_time
ON documents(release_time DESC);

CREATE INDEX IF NOT EXISTS idx_documents_stock_code
ON documents(stock_code);

CREATE TABLE IF NOT EXISTS allocation_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id TEXT NOT NULL,
    pool TEXT NOT NULL,
    shares_applied INTEGER NOT NULL,
    valid_applications INTEGER NOT NULL,
    allocation_text TEXT NOT NULL,
    successful_applications INTEGER,
    allotted_shares_per_successful_application INTEGER,
    allotted_percent_text TEXT NOT NULL,
    allotted_ratio REAL,
    row_order INTEGER NOT NULL,
    FOREIGN KEY (news_id) REFERENCES documents(news_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_allocation_rows_news_id
ON allocation_rows(news_id, row_order);
