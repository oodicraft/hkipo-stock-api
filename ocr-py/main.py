from __future__ import annotations

import argparse
import html
import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import fitz
import pytesseract
import requests
from PIL import Image
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from db import (
    IPOCurrentRecord,
    create_daily_run,
    fetch_ipo_current_by_list_date,
    fetch_ipo_current_codes,
    fetch_local_successful_codes,
    normalize_code,
    sync_local_results,
    update_daily_run,
)


HKEX_ORIGIN = "https://www1.hkexnews.hk"
HKEX_SEARCH_URL = f"{HKEX_ORIGIN}/search/titleSearchServlet.do"
HKEX_TITLE_SEARCH_PAGE = f"{HKEX_ORIGIN}/search/titlesearch.xhtml"
HKEX_ACTIVE_STOCKS_URL = f"{HKEX_ORIGIN}/ncms/script/eds/activestock_sehk_e.json"
HKEX_INACTIVE_STOCKS_URL = f"{HKEX_ORIGIN}/ncms/script/eds/inactivestock_sehk_e.json"
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PDF_DIR = DATA_DIR / "pdf"
DB_PATH = DATA_DIR / "hkex_ipo_allotment.sqlite"
USER_AGENT = "hkipo-ocr-mvp/0.1"
HTTP_TIMEOUT = (10, 60)
DAILY_TIMEZONE = ZoneInfo("Asia/Shanghai")


@dataclass(frozen=True)
class HkexDocument:
    news_id: str
    stock_code: str
    stock_name: str
    title: str
    release_time: str
    file_info: str
    file_type: str
    file_url: str
    local_pdf_path: Path


@dataclass
class RunSummary:
    selected: int = 0
    downloaded: int = 0
    processed: int = 0
    skipped: int = 0
    failed: int = 0
    synced: int = 0


def ensure_dirs() -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def http_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    retries = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=1.0,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=8, pool_maxsize=8)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def hkex_get(url: str, **kwargs: Any) -> requests.Response:
    kwargs.setdefault("timeout", HTTP_TIMEOUT)
    response = http_session().get(url, **kwargs)
    response.raise_for_status()
    return response


def connect_db() -> sqlite3.Connection:
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    init_db(conn)
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS documents (
            news_id TEXT PRIMARY KEY,
            stock_code TEXT NOT NULL,
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
        """
    )
    conn.commit()


def parse_hkex_datetime(value: str) -> datetime:
    return datetime.strptime(value, "%d/%m/%Y %H:%M")


def parse_list_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d")


def yyyymmdd(value: datetime) -> str:
    return value.strftime("%Y%m%d")


def is_ipo_allotment_pdf(row: dict[str, Any]) -> bool:
    title = str(row.get("TITLE", ""))
    headline = str(row.get("SHORT_TEXT", ""))
    file_type = str(row.get("FILE_TYPE", ""))
    return (
        file_type.upper() == "PDF"
        and "allotment result" in title.lower()
        and "Allotment Results" in headline
        and "rights issue" not in title.lower()
        and "rights issue" not in headline.lower()
    )


def search_hkex_documents(start: datetime, end: datetime) -> list[dict[str, Any]]:
    params = {
        "sortDir": "0",
        "sortByOptions": "DateTime",
        "category": "0",
        "market": "SEHK",
        "searchType": "rbAfter2006",
        "t1code": "-2",
        "t2Gcode": "-2",
        "t2code": "-2",
        "documentType": "-1",
        "from": yyyymmdd(start),
        "to": yyyymmdd(end),
        "title": "ALLOTMENT RESULTS",
        "rowRange": "500",
        "lang": "en",
    }
    response = hkex_get(HKEX_SEARCH_URL, params=params)
    payload = response.json()
    result = payload.get("result")
    if not result or result == "null":
        return []
    return [row for row in json.loads(result) if is_ipo_allotment_pdf(row)]


@lru_cache(maxsize=1)
def hkex_stock_ids_by_code() -> dict[str, str]:
    stock_ids: dict[str, str] = {}
    for url in (HKEX_ACTIVE_STOCKS_URL, HKEX_INACTIVE_STOCKS_URL):
        response = hkex_get(url)
        for stock in response.json():
            code = normalize_code(str(stock.get("c", "")))
            stock_id = stock.get("i")
            if code and stock_id:
                stock_ids[code] = str(stock_id)
    return stock_ids


def hkex_stock_id_for_code(code: str) -> str | None:
    return hkex_stock_ids_by_code().get(code)


def title_search_page_document_for_ipo(ipo: IPOCurrentRecord) -> HkexDocument | None:
    stock_id = hkex_stock_id_for_code(ipo.code)
    if not stock_id:
        return None

    response = hkex_get(
        HKEX_TITLE_SEARCH_PAGE,
        params={"category": "0", "lang": "EN", "market": "SEHK", "stockId": stock_id},
    )

    list_date = parse_list_date(ipo.list_date) if ipo.list_date else None
    start = list_date - timedelta(days=14) if list_date else None
    end = list_date + timedelta(days=7) if list_date else None
    documents: list[HkexDocument] = []

    for row_html in re.findall(r"<tr\b[\s\S]*?</tr>", response.text, flags=re.I):
        if "Allotment Results" not in row_html:
            continue

        release_match = re.search(r"Release Time:\s*</span>\s*([^<]+)", row_html, flags=re.I)
        code_match = re.search(r"Stock Code:\s*</span>\s*([^<]+)", row_html, flags=re.I)
        name_match = re.search(r"Stock Short Name:\s*</span>\s*([^<]+)", row_html, flags=re.I)
        link_match = re.search(r'href="([^"]+\.pdf)"[^>]*>([\s\S]*?)</a>', row_html, flags=re.I)
        if not release_match or not code_match or not link_match:
            continue

        release_time = html.unescape(release_match.group(1)).strip()
        release_datetime = parse_hkex_datetime(release_time)
        if start and release_datetime < start:
            continue
        if end and release_datetime > end:
            continue
        if normalize_code(html.unescape(code_match.group(1)).strip()) != ipo.code:
            continue

        file_url = urljoin(HKEX_ORIGIN, html.unescape(link_match.group(1)).strip())
        title = normalize_text(re.sub(r"<[^>]+>", " ", html.unescape(link_match.group(2))))
        news_id = Path(file_url).stem
        documents.append(
            HkexDocument(
                news_id=news_id,
                stock_code=ipo.code,
                stock_name=html.unescape(name_match.group(1)).strip() if name_match else ipo.name,
                title=title,
                release_time=release_time,
                file_info="",
                file_type="PDF",
                file_url=file_url,
                local_pdf_path=PDF_DIR / f"{ipo.code}_{news_id}.pdf",
            )
        )

    if not documents:
        return None
    return sorted(documents, key=lambda document: parse_hkex_datetime(document.release_time), reverse=True)[0]


def find_hkex_document_for_ipo(ipo: IPOCurrentRecord) -> HkexDocument | None:
    if not ipo.list_date:
        return title_search_page_document_for_ipo(ipo)

    list_date = parse_list_date(ipo.list_date)
    rows = search_hkex_documents(list_date - timedelta(days=14), list_date + timedelta(days=7))
    matches = [row for row in rows if normalize_code(str(row.get("STOCK_CODE", ""))) == ipo.code]
    if not matches:
        return title_search_page_document_for_ipo(ipo)

    latest = sorted(matches, key=lambda row: parse_hkex_datetime(str(row["DATE_TIME"])), reverse=True)[0]
    return row_to_document(latest)


def row_to_document(row: dict[str, Any]) -> HkexDocument:
    news_id = str(row["NEWS_ID"])
    stock_code = normalize_code(str(row["STOCK_CODE"]))
    file_url = urljoin(HKEX_ORIGIN, str(row["FILE_LINK"]))
    local_pdf_path = PDF_DIR / f"{stock_code}_{news_id}.pdf"
    return HkexDocument(
        news_id=news_id,
        stock_code=stock_code,
        stock_name=str(row.get("STOCK_NAME", "")),
        title=str(row.get("TITLE", "")).replace("\n", " ").strip(),
        release_time=str(row.get("DATE_TIME", "")),
        file_info=str(row.get("FILE_INFO", "")),
        file_type=str(row.get("FILE_TYPE", "")),
        file_url=file_url,
        local_pdf_path=local_pdf_path,
    )


def upsert_document(conn: sqlite3.Connection, document: HkexDocument) -> None:
    conn.execute(
        """
        INSERT INTO documents (
            news_id, stock_code, stock_name, title, release_time, file_info, file_type,
            file_url, local_pdf_path, downloaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT downloaded_at FROM documents WHERE news_id = ?), ?))
        ON CONFLICT(news_id) DO UPDATE SET
            stock_code = excluded.stock_code,
            stock_name = excluded.stock_name,
            title = excluded.title,
            release_time = excluded.release_time,
            file_info = excluded.file_info,
            file_type = excluded.file_type,
            file_url = excluded.file_url,
            local_pdf_path = excluded.local_pdf_path
        """,
        (
            document.news_id,
            document.stock_code,
            document.stock_name,
            document.title,
            document.release_time,
            document.file_info,
            document.file_type,
            document.file_url,
            str(document.local_pdf_path.relative_to(BASE_DIR)),
            document.news_id,
            None,
        ),
    )
    conn.commit()


def save_missing_document(conn: sqlite3.Connection, ipo: IPOCurrentRecord, error_message: str) -> None:
    news_id = f"missing_{ipo.code}"
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO documents (
            news_id, stock_code, stock_name, title, release_time, file_info, file_type,
            file_url, local_pdf_path, downloaded_at, processed_at, extraction_method, raw_text, parse_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?)
        ON CONFLICT(news_id) DO UPDATE SET
            stock_name = excluded.stock_name,
            processed_at = excluded.processed_at,
            parse_error = excluded.parse_error
        """,
        (
            news_id,
            ipo.code,
            ipo.name,
            "HKEX allotment result PDF not found",
            ipo.list_date or "",
            "",
            "MISSING",
            "",
            "",
            now,
            error_message,
        ),
    )
    conn.commit()


def download_pdf(conn: sqlite3.Connection, document: HkexDocument, overwrite: bool = False) -> bool:
    if document.local_pdf_path.exists() and not overwrite:
        return False

    response = hkex_get(document.file_url)
    document.local_pdf_path.write_bytes(response.content)
    conn.execute(
        "UPDATE documents SET downloaded_at = ? WHERE news_id = ?",
        (datetime.now().isoformat(timespec="seconds"), document.news_id),
    )
    conn.commit()
    return True


def extract_text_from_pdf(pdf_path: Path, force_ocr: bool = False) -> tuple[str, str]:
    with fitz.open(pdf_path) as doc:
        if not force_ocr:
            text = "\n".join(page.get_text("text") for page in doc)
            if len(text.strip()) >= 200 and "BASIS OF ALLOCATION" in text.upper():
                return text, "text"

        pages: list[str] = []
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            pages.append(pytesseract.image_to_string(image, lang="eng"))
        return "\n".join(pages), "ocr"


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\x00", " ")).strip()


def parse_int(value: str) -> int:
    return int(value.replace(",", ""))


def parse_percent(value: str) -> float | None:
    try:
        return float(value.replace("%", "")) / 100
    except ValueError:
        return None


def extract_allocation_section(text: str) -> str:
    normalized = normalize_text(text)
    start = re.search(r"BASIS OF ALLOCATION UNDER THE HONG KONG PUBLIC OFFERING", normalized, re.I)
    if not start:
        raise ValueError("allocation basis section not found")
    tail = normalized[start.start() :]
    end = re.search(
        r"\s(?:COMPLIANCE WITH LISTING RULES|DESPATCH/COLLECTION|SHAREHOLDING CONCENTRATION|PUBLIC FLOAT|OTHERS/ADDITIONAL INFORMATION)\b",
        tail,
        re.I,
    )
    return tail[: end.start()] if end else tail


def parse_pool_rows(section: str, pool: str) -> list[dict[str, Any]]:
    table_only = re.sub(r"\d[\d,]*\s+Total number of Pool\s+[AB][\s\S]*$", "", section, flags=re.I)
    pattern = re.compile(
        r"(\d[\d,]*)\s+(\d[\d,]*)\s+(.+?)\s+(\d+(?:\.\d+)?%)\s*(?=\d[\d,]*\s+\d[\d,]*\s+|Total number|POOL\s+[AB]|$)",
        re.I,
    )
    rows: list[dict[str, Any]] = []
    for match in pattern.finditer(table_only):
        allocation_text = match.group(3).strip()
        successful = re.match(r"([\d,]+)\s+out of", allocation_text, re.I)
        allotted = re.search(r"receive\s+([\d,]+)\s+(?:H\s+)?Shares?", allocation_text, re.I)
        rows.append(
            {
                "pool": pool,
                "shares_applied": parse_int(match.group(1)),
                "valid_applications": parse_int(match.group(2)),
                "allocation_text": allocation_text,
                "successful_applications": parse_int(successful.group(1)) if successful else None,
                "allotted_shares_per_successful_application": parse_int(allotted.group(1)) if allotted else None,
                "allotted_percent_text": match.group(4),
                "allotted_ratio": parse_percent(match.group(4)),
            }
        )
    return rows


def parse_allocation_rows(text: str) -> list[dict[str, Any]]:
    section = extract_allocation_section(text)
    pool_a = re.search(r"POOL A", section, re.I)
    pool_b = re.search(r"POOL B", section, re.I)
    if not pool_a and not pool_b:
        return parse_pool_rows(section, "")

    rows: list[dict[str, Any]] = []
    if pool_a:
        end = pool_b.start() if pool_b and pool_b.start() > pool_a.start() else len(section)
        rows.extend(parse_pool_rows(section[pool_a.start() : end], "A"))
    if pool_b:
        rows.extend(parse_pool_rows(section[pool_b.start() :], "B"))
    return rows


def save_processed_result(conn: sqlite3.Connection, news_id: str, text: str, method: str, rows: list[dict[str, Any]]) -> None:
    conn.execute("DELETE FROM allocation_rows WHERE news_id = ?", (news_id,))
    for index, row in enumerate(rows, start=1):
        conn.execute(
            """
            INSERT INTO allocation_rows (
                news_id, pool, shares_applied, valid_applications, allocation_text,
                successful_applications, allotted_shares_per_successful_application,
                allotted_percent_text, allotted_ratio, row_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                news_id,
                row["pool"],
                row["shares_applied"],
                row["valid_applications"],
                row["allocation_text"],
                row["successful_applications"],
                row["allotted_shares_per_successful_application"],
                row["allotted_percent_text"],
                row["allotted_ratio"],
                index,
            ),
        )
    conn.execute(
        """
        UPDATE documents
        SET processed_at = ?, extraction_method = ?, raw_text = ?, parse_error = NULL
        WHERE news_id = ?
        """,
        (datetime.now().isoformat(timespec="seconds"), method, text, news_id),
    )
    conn.commit()


def save_processing_error(conn: sqlite3.Connection, news_id: str, error: Exception) -> None:
    conn.execute(
        "UPDATE documents SET processed_at = ?, parse_error = ? WHERE news_id = ?",
        (datetime.now().isoformat(timespec="seconds"), str(error), news_id),
    )
    conn.commit()


def local_documents_for_code(conn: sqlite3.Connection, code: str) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT *
        FROM documents
        WHERE stock_code = ?
        ORDER BY release_time DESC
        """,
        (code,),
    ).fetchall()


def has_successful_document(documents: list[sqlite3.Row]) -> bool:
    return any(document["processed_at"] and document["parse_error"] is None for document in documents)


def has_failed_placeholder(documents: list[sqlite3.Row]) -> bool:
    return any(str(document["file_type"]) == "MISSING" and document["parse_error"] for document in documents)


def successful_result_for_code(conn: sqlite3.Connection, code: str) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT d.news_id, d.stock_code, d.stock_name, d.release_time, d.extraction_method,
               d.processed_at, COUNT(r.id) AS allocation_rows
        FROM documents d
        JOIN allocation_rows r ON r.news_id = d.news_id
        WHERE d.stock_code = ?
          AND d.processed_at IS NOT NULL
          AND d.parse_error IS NULL
        GROUP BY d.news_id
        ORDER BY d.release_time DESC
        LIMIT 1
        """,
        (code,),
    ).fetchone()


def print_code_result(conn: sqlite3.Connection, code: str) -> None:
    result = successful_result_for_code(conn, code)
    if result:
        print(
            "result: "
            f"{result['stock_code']} {result['stock_name']} "
            f"release_time={result['release_time']} "
            f"rows={result['allocation_rows']} "
            f"method={result['extraction_method']} "
            f"processed_at={result['processed_at']}"
        )
        return

    documents = local_documents_for_code(conn, code)
    latest_error = next((document for document in documents if document["parse_error"]), None)
    if latest_error:
        print(f"result: {code} failed parse_error={latest_error['parse_error']}")
    else:
        print(f"result: {code} no allocation result data")


def process_document(conn: sqlite3.Connection, document: sqlite3.Row, force_ocr: bool) -> str:
    pdf_path = BASE_DIR / str(document["local_pdf_path"])
    if not pdf_path.exists():
        raise FileNotFoundError(f"local PDF not found: {pdf_path}")

    text, method = extract_text_from_pdf(pdf_path, force_ocr=force_ocr)
    rows = parse_allocation_rows(text)
    if not rows:
        raise ValueError("no allocation rows parsed")
    save_processed_result(conn, str(document["news_id"]), text, method, rows)
    return method


def ensure_ipo_document(conn: sqlite3.Connection, ipo: IPOCurrentRecord, overwrite: bool, summary: RunSummary) -> None:
    documents = local_documents_for_code(conn, ipo.code)
    if documents and has_successful_document(documents) and not overwrite:
        return
    if documents and has_failed_placeholder(documents) and not overwrite:
        print(f"skipped: {ipo.code} previous HKEX lookup failed")
        summary.skipped += 1
        return

    needs_remote_lookup = overwrite or not documents
    if not needs_remote_lookup:
        for document in documents:
            if str(document["file_type"]) != "PDF":
                continue
            pdf_path = BASE_DIR / str(document["local_pdf_path"])
            if not pdf_path.exists():
                needs_remote_lookup = True
                break

    if not needs_remote_lookup:
        return

    document = find_hkex_document_for_ipo(ipo)
    if not document:
        save_missing_document(conn, ipo, "HKEX allotment result PDF not found")
        print(f"failed: {ipo.code} HKEX allotment result PDF not found")
        summary.failed += 1
        return

    upsert_document(conn, document)
    if download_pdf(conn, document, overwrite=overwrite):
        summary.downloaded += 1
        print(f"downloaded: {document.stock_code} {document.release_time} {document.local_pdf_path}")
    else:
        print(f"exists: {document.stock_code} {document.release_time} {document.local_pdf_path}")


def process_ipo(conn: sqlite3.Connection, ipo: IPOCurrentRecord, overwrite: bool, force_ocr: bool, summary: RunSummary) -> None:
    try:
        ensure_ipo_document(conn, ipo, overwrite=overwrite, summary=summary)
    except requests.RequestException as error:
        save_missing_document(conn, ipo, f"HKEX lookup failed: {error}")
        summary.failed += 1
        print(f"failed: {ipo.code} HKEX lookup failed: {error}")
        return
    except Exception as error:  # noqa: BLE001 - keep large batch runs moving after one lookup failure.
        save_missing_document(conn, ipo, f"HKEX lookup failed: {error}")
        summary.failed += 1
        print(f"failed: {ipo.code} HKEX lookup failed: {error}")
        return

    documents = local_documents_for_code(conn, ipo.code)
    if not documents:
        return

    for document in documents:
        if str(document["file_type"]) != "PDF":
            continue
        already_processed = document["processed_at"] and document["parse_error"] is None
        if already_processed and not overwrite and not force_ocr:
            print(f"skipped: {ipo.code} already processed")
            summary.skipped += 1
            continue
        already_failed = document["processed_at"] and document["parse_error"] is not None
        if already_failed and not overwrite and not force_ocr:
            print(f"skipped: {ipo.code} previous processing failed: {document['parse_error']}")
            summary.skipped += 1
            continue

        try:
            method = process_document(conn, document, force_ocr=force_ocr)
            summary.processed += 1
            print(f"processed: {ipo.code} {document['release_time']} method={method}")
        except Exception as error:  # noqa: BLE001 - records every file-level failure in SQLite.
            save_processing_error(conn, str(document["news_id"]), error)
            summary.failed += 1
            print(f"failed: {ipo.code} {document['release_time']} {error}")


def selected_ipos(args: argparse.Namespace) -> list[IPOCurrentRecord]:
    if args.daily:
        return fetch_ipo_current_by_list_date(daily_run_date())

    date_filter = args.date
    if date_filter is None and not args.sync and not args.code:
        date_filter = "30"

    if args.sync and date_filter is None and not args.code:
        codes = fetch_local_successful_codes()
        return [IPOCurrentRecord(code=code, name="", list_date=None) for code in codes]

    return fetch_ipo_current_codes(date_filter=date_filter, code=args.code)


def daily_run_date() -> str:
    return datetime.now(DAILY_TIMEZONE).date().isoformat()


def run_selected_ipos(args: argparse.Namespace, ipos: list[IPOCurrentRecord], summary: RunSummary) -> None:
    with connect_db() as conn:
        if not (args.sync and args.date is None and args.code is None and not args.daily):
            for ipo in ipos:
                process_ipo(conn, ipo, overwrite=args.overwrite, force_ocr=args.force_ocr, summary=summary)
            if args.code:
                print_code_result(conn, args.code)

    should_sync = args.sync or args.daily
    if should_sync:
        summary.synced = sync_local_results([ipo.code for ipo in ipos])
        print(f"synced: {summary.synced} documents")


def print_summary(summary: RunSummary) -> None:
    print("summary:")
    print(f"selected: {summary.selected}")
    print(f"downloaded: {summary.downloaded}")
    print(f"processed: {summary.processed}")
    print(f"skipped: {summary.skipped}")
    print(f"failed: {summary.failed}")
    print(f"synced: {summary.synced}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fetch, parse, and sync HKEX IPO allotment result PDFs.")
    parser.add_argument("--code", help="Process a single stock code")
    parser.add_argument("--date", choices=["7", "30", "all"], help="Select IPOs by D1 ipo_current.list_date")
    parser.add_argument("--daily", action="store_true", help="Process IPOs with ipo_current.list_date equal to today and sync to D1")
    parser.add_argument("--sync", action="store_true", help="Sync selected local results to Cloudflare D1")
    parser.add_argument("--overwrite", action="store_true", help="Retry HKEX lookup/download and reprocess existing records")
    parser.add_argument("--force-ocr", action="store_true", help="Use OCR even when embedded text is available")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.daily and (args.code or args.date):
        raise SystemExit("--daily cannot be combined with --code or --date")
    if args.code:
        args.code = normalize_code(args.code)

    summary = RunSummary()
    daily_run_id: str | None = None
    try:
        if args.daily:
            run_date = daily_run_date()
            daily_run_id = create_daily_run(run_date)
            print(f"daily run: id={daily_run_id} date={run_date}")

        ipos = selected_ipos(args)
        summary.selected = len(ipos)

        if not ipos:
            print("no matching IPO codes")
            if daily_run_id:
                update_daily_run(
                    daily_run_id,
                    status="success",
                    selected_count=summary.selected,
                    downloaded_count=summary.downloaded,
                    processed_count=summary.processed,
                    skipped_count=summary.skipped,
                    failed_count=summary.failed,
                    synced_count=summary.synced,
                )
            print_summary(summary)
            return

        run_selected_ipos(args, ipos, summary)

        if daily_run_id:
            update_daily_run(
                daily_run_id,
                status="success",
                selected_count=summary.selected,
                downloaded_count=summary.downloaded,
                processed_count=summary.processed,
                skipped_count=summary.skipped,
                failed_count=summary.failed,
                synced_count=summary.synced,
            )
    except Exception as error:
        if daily_run_id:
            update_daily_run(
                daily_run_id,
                status="failed",
                selected_count=summary.selected,
                downloaded_count=summary.downloaded,
                processed_count=summary.processed,
                skipped_count=summary.skipped,
                failed_count=summary.failed,
                synced_count=summary.synced,
                error_message=str(error),
            )
        raise

    print_summary(summary)


if __name__ == "__main__":
    main()
