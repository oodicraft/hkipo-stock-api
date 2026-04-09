CREATE TABLE IF NOT EXISTS analytics_service (
    service_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_install (
    service_key TEXT NOT NULL,
    install_id_hash TEXT NOT NULL,
    first_seen_date TEXT NOT NULL,
    last_seen_date TEXT NOT NULL,
    first_app_version TEXT NOT NULL DEFAULT '',
    last_app_version TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (service_key, install_id_hash),
    FOREIGN KEY (service_key) REFERENCES analytics_service(service_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_install_service_first_seen
ON analytics_install(service_key, first_seen_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_install_service_last_seen
ON analytics_install(service_key, last_seen_date DESC);

CREATE TABLE IF NOT EXISTS analytics_daily_install_activity (
    service_key TEXT NOT NULL,
    install_id_hash TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    last_event_at TEXT NOT NULL,
    source_event TEXT NOT NULL,
    PRIMARY KEY (service_key, install_id_hash, activity_date),
    FOREIGN KEY (service_key, install_id_hash) REFERENCES analytics_install(service_key, install_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_install_activity_service_date
ON analytics_daily_install_activity(service_key, activity_date DESC);

CREATE TABLE IF NOT EXISTS analytics_daily_metric (
    service_key TEXT NOT NULL,
    metric_date TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    unique_actor_count INTEGER NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (service_key, metric_date, metric_name),
    FOREIGN KEY (service_key) REFERENCES analytics_service(service_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_metric_service_date
ON analytics_daily_metric(service_key, metric_date DESC);

CREATE TABLE IF NOT EXISTS analytics_daily_page (
    service_key TEXT NOT NULL,
    page_key TEXT NOT NULL,
    metric_date TEXT NOT NULL,
    view_count INTEGER NOT NULL DEFAULT 0,
    unique_visitor_count INTEGER NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (service_key, page_key, metric_date),
    FOREIGN KEY (service_key) REFERENCES analytics_service(service_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_page_service_date
ON analytics_daily_page(service_key, metric_date DESC);

CREATE TABLE IF NOT EXISTS analytics_daily_retention (
    service_key TEXT NOT NULL,
    cohort_date TEXT NOT NULL,
    return_day INTEGER NOT NULL,
    cohort_size INTEGER NOT NULL DEFAULT 0,
    retained_count INTEGER NOT NULL DEFAULT 0,
    retention_rate REAL NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (service_key, cohort_date, return_day),
    FOREIGN KEY (service_key) REFERENCES analytics_service(service_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_retention_service_cohort
ON analytics_daily_retention(service_key, cohort_date DESC);
