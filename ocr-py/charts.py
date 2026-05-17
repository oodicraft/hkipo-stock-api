from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from matplotlib.ticker import FuncFormatter


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR / "data" / "hkex_ipo_allotment.sqlite"
DEFAULT_OUTPUT_PATH = BASE_DIR / "data" / "charts" / "pool_a_first_lot.png"


def release_time_sort_expression() -> str:
    return """
      substr(d.release_time, 7, 4) || '-' ||
      substr(d.release_time, 4, 2) || '-' ||
      substr(d.release_time, 1, 2) || ' ' ||
      substr(d.release_time, 12, 5)
    """


def load_pool_a_first_lot(db_path: Path) -> pd.DataFrame:
    if not db_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {db_path}")

    query = f"""
        SELECT
            d.stock_code,
            d.stock_name,
            d.release_time,
            r.valid_applications,
            r.allotted_ratio,
            r.allotted_percent_text
        FROM allocation_rows r
        JOIN documents d ON d.news_id = r.news_id
        WHERE r.pool = 'A'
          AND r.row_order = 1
        ORDER BY {release_time_sort_expression()} ASC, d.stock_code ASC
    """

    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
        df = pd.read_sql_query(query, conn)

    if df.empty:
        raise ValueError("No Pool A row_order=1 data found in SQLite database.")

    df["stock_code"] = df["stock_code"].astype(str).str.zfill(5)
    df["valid_applications"] = pd.to_numeric(df["valid_applications"], errors="raise")
    df["allotted_ratio"] = pd.to_numeric(df["allotted_ratio"], errors="coerce")
    return df


def percent_formatter(value: float, _position: int) -> str:
    return f"{value:.0%}" if value >= 0.01 else f"{value:.2%}"


def plot_pool_a_first_lot(df: pd.DataFrame, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid", context="notebook")

    fig, ax_applications = plt.subplots(figsize=(14, 7))
    sns.barplot(
        data=df,
        x="stock_code",
        y="valid_applications",
        ax=ax_applications,
        color="#5b8def",
        edgecolor="#315a9f",
    )

    ax_rate = ax_applications.twinx()
    sns.lineplot(
        data=df,
        x="stock_code",
        y="allotted_ratio",
        ax=ax_rate,
        color="#c2410c",
        marker="o",
        linewidth=2.4,
        markersize=7,
        sort=False,
    )

    ax_applications.set_title("HKEX IPO Pool A First-Lot Applications and Allotment Rate", pad=18)
    ax_applications.set_xlabel("Stock Code (ordered by release time)")
    ax_applications.set_ylabel("Valid Applications")
    ax_rate.set_ylabel("Allotment Rate")
    ax_rate.yaxis.set_major_formatter(FuncFormatter(percent_formatter))

    ax_applications.tick_params(axis="x", rotation=45)
    ax_applications.margins(x=0.02)
    ax_rate.grid(False)

    for index, row in df.iterrows():
        if pd.notna(row["allotted_ratio"]):
            ax_rate.annotate(
                str(row["allotted_percent_text"]),
                xy=(index, row["allotted_ratio"]),
                xytext=(0, 8),
                textcoords="offset points",
                ha="center",
                va="bottom",
                fontsize=8,
                color="#7c2d12",
            )

    fig.tight_layout()
    fig.savefig(output_path, dpi=180)
    plt.close(fig)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Draw HKEX IPO allotment charts from the local SQLite database.")
    subparsers = parser.add_subparsers(dest="command")

    pool_parser = subparsers.add_parser("pool-a-first-lot", help="Plot Pool A row_order=1 applications and allotment rate")
    pool_parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    pool_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "pool-a-first-lot":
        df = load_pool_a_first_lot(args.db)
        plot_pool_a_first_lot(df, args.output)
        print(f"wrote {args.output}")
        print(f"rows: {len(df)}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
