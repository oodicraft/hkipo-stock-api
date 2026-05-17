# HKEX IPO allotment OCR MVP

This folder is isolated from the Worker backend. It fetches recent HKEX IPO allotment PDFs,
saves them under `data/pdf/`, extracts allocation-basis rows, and stores the result in SQLite.

## Commands

```bash
uv run python main.py
uv run python main.py --code 01236
uv run python main.py --date 7
uv run python main.py --date 30 --sync
uv run python main.py --daily
uv run python main.py --sync
uv run python charts.py pool-a-first-lot
```

Without arguments, `main.py` selects IPOs listed in the last 30 days from the Cloudflare D1
`ipo_current` table, fills missing HKEX allotment PDFs, and processes records that have not
already succeeded. Use `--code` to limit work to one stock without the default 30-day date
filter, `--date 7|30|all` to select by `ipo_current.list_date`, and `--sync` to upload successful local `documents` and
`allocation_rows` into the D1 database configured as `hkipo-db-prod`.
Use `--daily` in automation to select stocks whose `ipo_current.list_date` equals today's
Asia/Shanghai date, process them, sync successful results to D1, and write an `ocr_daily_run`
summary row. GitHub Actions requires the `CLOUDFLARE_API_TOKEN` repository secret.

The parser first uses embedded PDF text through PyMuPDF. If the PDF has no usable text, it falls
back to OCR through `pytesseract`. OCR requires the system `tesseract` binary to be installed.

Outputs:

- PDFs: `data/pdf/`
- SQLite: `data/hkex_ipo_allotment.sqlite`
- Charts: `data/charts/`

## Charts

```bash
uv run python charts.py pool-a-first-lot
```

The first chart filters `allocation_rows` to `pool = 'A'` and `row_order = 1`, orders stocks by
HKEX release time, draws valid applications as bars, and overlays the allotment rate as a line.
The default output is `data/charts/pool_a_first_lot.png`.
