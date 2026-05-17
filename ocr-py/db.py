from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4


BASE_DIR = Path(__file__).resolve().parent
REPO_DIR = BASE_DIR.parent
LOCAL_DB_PATH = BASE_DIR / "data" / "hkex_ipo_allotment.sqlite"
D1_DATABASE_NAME = "hkipo-db-prod"
CLOUDFLARE_ACCOUNT_ID = "1b274046e2cd493b06953fe9fafe1fc2"
DOCUMENT_COLUMNS = [
    "news_id",
    "stock_code",
    "stock_name",
    "title",
    "release_time",
    "file_info",
    "file_type",
    "file_url",
    "local_pdf_path",
    "downloaded_at",
    "processed_at",
    "extraction_method",
    "raw_text",
    "parse_error",
]


@dataclass(frozen=True)
class IPOCurrentRecord:
    code: str
    name: str
    list_date: str | None


def _run_wrangler(args: list[str]) -> list[dict[str, Any]]:
    command = ["npx", "wrangler", "d1", "execute", D1_DATABASE_NAME, "--remote", "--json", *args]
    env = os.environ.copy()
    env.setdefault("CLOUDFLARE_ACCOUNT_ID", CLOUDFLARE_ACCOUNT_ID)
    result = subprocess.run(command, cwd=REPO_DIR, env=env, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            "wrangler d1 execute failed\n"
            f"command: {' '.join(command)}\n"
            f"stdout: {result.stdout.strip()}\n"
            f"stderr: {result.stderr.strip()}"
        )

    stdout = result.stdout.strip()
    json_start_candidates = [index for index in (stdout.find("["), stdout.find("{")) if index >= 0]
    if json_start_candidates:
        stdout = stdout[min(json_start_candidates) :]

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"wrangler returned non-JSON output: {result.stdout}") from error

    if not isinstance(payload, list):
        raise RuntimeError(f"unexpected wrangler JSON payload: {payload!r}")
    return payload


def _execute_remote_command(sql: str) -> list[dict[str, Any]]:
    return _run_wrangler(["--command", sql])


def _execute_remote_file(sql: str) -> list[dict[str, Any]]:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as file:
        file.write(sql)
        temp_path = Path(file.name)
    try:
        return _run_wrangler(["--file", str(temp_path)])
    finally:
        temp_path.unlink(missing_ok=True)


def _results(payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in payload:
        if not item.get("success", False):
            raise RuntimeError(f"wrangler SQL execution failed: {item!r}")
        item_results = item.get("results") or []
        if isinstance(item_results, list):
            rows.extend(item_results)
    return rows


def _sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int | float):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _values(values: Iterable[Any]) -> str:
    return ", ".join(_sql_literal(value) for value in values)


def normalize_code(code: str) -> str:
    return code.strip().zfill(5)


def fetch_ipo_current_codes(date_filter: str | None = None, code: str | None = None) -> list[IPOCurrentRecord]:
    conditions: list[str] = []
    if code:
        conditions.append(f"code = {_sql_literal(normalize_code(code))}")

    if date_filter and date_filter != "all":
        cutoff = (date.today() - timedelta(days=int(date_filter))).isoformat()
        conditions.append(f"list_date IS NOT NULL AND list_date >= {_sql_literal(cutoff)}")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = _results(
        _execute_remote_command(
            f"""
            SELECT code, name, list_date
            FROM ipo_current
            {where_clause}
            ORDER BY list_date DESC, code ASC
            """
        )
    )
    return [
        IPOCurrentRecord(
            code=normalize_code(str(row["code"])),
            name=str(row.get("name") or ""),
            list_date=str(row["list_date"]) if row.get("list_date") else None,
        )
        for row in rows
    ]


def fetch_ipo_current_by_list_date(list_date: str) -> list[IPOCurrentRecord]:
    rows = _results(
        _execute_remote_command(
            f"""
            SELECT code, name, list_date
            FROM ipo_current
            WHERE list_date = {_sql_literal(list_date)}
            ORDER BY code ASC
            """
        )
    )
    return [
        IPOCurrentRecord(
            code=normalize_code(str(row["code"])),
            name=str(row.get("name") or ""),
            list_date=str(row["list_date"]) if row.get("list_date") else None,
        )
        for row in rows
    ]


def ensure_remote_schema() -> None:
    _execute_remote_file(
        """
        DROP TABLE IF EXISTS ipo_allotment_result;

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

        CREATE TABLE IF NOT EXISTS ocr_daily_run (
            id TEXT PRIMARY KEY,
            run_date TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT NOT NULL,
            github_run_id TEXT,
            github_run_attempt TEXT,
            github_sha TEXT,
            selected_count INTEGER NOT NULL DEFAULT 0,
            downloaded_count INTEGER NOT NULL DEFAULT 0,
            processed_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            synced_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_ocr_daily_run_started_at
        ON ocr_daily_run(started_at DESC);

        CREATE INDEX IF NOT EXISTS idx_ocr_daily_run_run_date
        ON ocr_daily_run(run_date DESC);
        """
    )


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def create_daily_run(run_date: str) -> str:
    ensure_remote_schema()
    run_id = str(uuid4())
    _execute_remote_command(
        f"""
        INSERT INTO ocr_daily_run (
            id, run_date, started_at, status, github_run_id, github_run_attempt, github_sha
        ) VALUES (
            {_sql_literal(run_id)},
            {_sql_literal(run_date)},
            {_sql_literal(now_iso())},
            'running',
            {_sql_literal(os.environ.get('GITHUB_RUN_ID'))},
            {_sql_literal(os.environ.get('GITHUB_RUN_ATTEMPT'))},
            {_sql_literal(os.environ.get('GITHUB_SHA'))}
        )
        """
    )
    return run_id


def update_daily_run(
    run_id: str,
    *,
    status: str,
    selected_count: int,
    downloaded_count: int,
    processed_count: int,
    skipped_count: int,
    failed_count: int,
    synced_count: int,
    error_message: str | None = None,
) -> None:
    _execute_remote_command(
        f"""
        UPDATE ocr_daily_run
        SET finished_at = {_sql_literal(now_iso())},
            status = {_sql_literal(status)},
            selected_count = {selected_count},
            downloaded_count = {downloaded_count},
            processed_count = {processed_count},
            skipped_count = {skipped_count},
            failed_count = {failed_count},
            synced_count = {synced_count},
            error_message = {_sql_literal(error_message)}
        WHERE id = {_sql_literal(run_id)}
        """
    )


def fetch_local_successful_codes() -> list[str]:
    if not LOCAL_DB_PATH.exists():
        return []

    with sqlite3.connect(LOCAL_DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT d.stock_code
            FROM documents d
            WHERE d.processed_at IS NOT NULL
              AND d.parse_error IS NULL
              AND EXISTS (SELECT 1 FROM allocation_rows r WHERE r.news_id = d.news_id)
            ORDER BY d.stock_code
            """
        ).fetchall()
    return [normalize_code(str(row[0])) for row in rows]


def _local_documents_for_codes(conn: sqlite3.Connection, codes: list[str]) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    if not codes:
        return []

    placeholders = ", ".join("?" for _ in codes)
    return conn.execute(
        f"""
        SELECT *
        FROM documents
        WHERE stock_code IN ({placeholders})
          AND processed_at IS NOT NULL
          AND parse_error IS NULL
          AND EXISTS (SELECT 1 FROM allocation_rows r WHERE r.news_id = documents.news_id)
        ORDER BY release_time DESC, stock_code ASC
        """,
        codes,
    ).fetchall()


def _remote_ipo_names(codes: list[str]) -> dict[str, str]:
    if not codes:
        return {}

    code_literals = ", ".join(_sql_literal(normalize_code(code)) for code in codes)
    rows = _results(
        _execute_remote_command(
            f"""
            SELECT code, name
            FROM ipo_current
            WHERE code IN ({code_literals})
            """
        )
    )
    return {normalize_code(str(row["code"])): str(row.get("name") or "") for row in rows}


def _local_rows_for_news(conn: sqlite3.Connection, news_id: str) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT pool, shares_applied, valid_applications, allocation_text,
               successful_applications, allotted_shares_per_successful_application,
               allotted_percent_text, allotted_ratio, row_order
        FROM allocation_rows
        WHERE news_id = ?
        ORDER BY row_order ASC
        """,
        (news_id,),
    ).fetchall()


def _remote_document_values(document: sqlite3.Row, ipo_names: dict[str, str]) -> list[Any]:
    values = [document[column] for column in DOCUMENT_COLUMNS]
    stock_code = normalize_code(str(document["stock_code"]))
    values[DOCUMENT_COLUMNS.index("stock_name")] = ipo_names.get(stock_code) or document["stock_name"]
    raw_text_index = DOCUMENT_COLUMNS.index("raw_text")
    values[raw_text_index] = None
    return values


def _sync_document(conn: sqlite3.Connection, document: sqlite3.Row, ipo_names: dict[str, str]) -> None:
    statements: list[str] = [
        "PRAGMA foreign_keys=ON;",
        """
        INSERT INTO documents (
            news_id, stock_code, stock_name, title, release_time, file_info, file_type,
            file_url, local_pdf_path, downloaded_at, processed_at, extraction_method,
            raw_text, parse_error
        ) VALUES ({values})
        ON CONFLICT(news_id) DO UPDATE SET
            stock_code = excluded.stock_code,
            stock_name = excluded.stock_name,
            title = excluded.title,
            release_time = excluded.release_time,
            file_info = excluded.file_info,
            file_type = excluded.file_type,
            file_url = excluded.file_url,
            local_pdf_path = excluded.local_pdf_path,
            downloaded_at = excluded.downloaded_at,
            processed_at = excluded.processed_at,
            extraction_method = excluded.extraction_method,
            raw_text = excluded.raw_text,
            parse_error = excluded.parse_error;
        """.format(
            values=_values(_remote_document_values(document, ipo_names))
        ),
        f"DELETE FROM allocation_rows WHERE news_id = {_sql_literal(document['news_id'])};",
    ]

    for row in _local_rows_for_news(conn, str(document["news_id"])):
        statements.append(
            """
            INSERT INTO allocation_rows (
                news_id, pool, shares_applied, valid_applications, allocation_text,
                successful_applications, allotted_shares_per_successful_application,
                allotted_percent_text, allotted_ratio, row_order
            ) VALUES ({values});
            """.format(
                values=_values(
                    [
                        document["news_id"],
                        row["pool"],
                        row["shares_applied"],
                        row["valid_applications"],
                        row["allocation_text"],
                        row["successful_applications"],
                        row["allotted_shares_per_successful_application"],
                        row["allotted_percent_text"],
                        row["allotted_ratio"],
                        row["row_order"],
                    ]
                )
            )
        )

    _execute_remote_file("\n".join(statements))


def sync_local_results(codes: list[str] | None = None) -> int:
    if not LOCAL_DB_PATH.exists():
        raise FileNotFoundError(f"local SQLite database not found: {LOCAL_DB_PATH}")

    selected_codes = [normalize_code(code) for code in codes] if codes else fetch_local_successful_codes()
    if not selected_codes:
        return 0
    ipo_names = _remote_ipo_names(selected_codes)

    with sqlite3.connect(LOCAL_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        documents = _local_documents_for_codes(conn, selected_codes)
        if not documents:
            return 0

    ensure_remote_schema()
    with sqlite3.connect(LOCAL_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        documents = _local_documents_for_codes(conn, selected_codes)
        for document in documents:
            _sync_document(conn, document, ipo_names)
    return len(documents)
