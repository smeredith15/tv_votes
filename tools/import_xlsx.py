"""Import the Alternative.xlsx ledgers into one canonical data/shows.json.

The workbook keeps four sheets (Weekly / 60 / 30 / Mini) that each repeat the
same show list with a per-person point allocation. The sheets have drifted out
of sync over time, so this importer merges them into a single show table and
derives ledger membership from each show's attributes instead.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "Alternative.xlsx"
OUT = ROOT / "data" / "shows.json"

# sheet name -> ledger id, and the two vote columns (F, G) in sheet order
SHEETS = {"Weekly": "weekly", "60": "hour", "30": "half", "Mini": "mini"}
PEOPLE = ("scotty", "shelby")

# "Mini" column values seen in the workbook -> canonical format
FORMATS = {
    "mini": "mini",
    "documentary": "documentary",
    "anthology/sketch/documentary": "anthology",
    "1": "limited",  # one-and-done / single season
}

ARTICLES = ("The", "A", "An")


def display_title(raw):
    """'100, The' -> 'The 100'. Titles are stored sort-first in the workbook."""
    title = str(raw).replace("\t", " ").strip()
    for article in ARTICLES:
        suffix = ", " + article
        if title.endswith(suffix):
            return f"{article} {title[: -len(suffix)]}"
    return title


def sort_key(title):
    stripped = re.sub(r"^(the|a|an)\s+", "", title, flags=re.I)
    return stripped.lower()


def slug(title):
    return re.sub(r"[^a-z0-9]+", "-", sort_key(title)).strip("-")


def read_rows(ws):
    for row in ws.iter_rows(min_row=10, max_col=7):
        if row[0].value is None:
            continue
        yield {
            "title": display_title(row[0].value),
            "runtime": row[1].value if row[1].value in (30, 60) else None,
            "format": FORMATS.get(str(row[2].value).strip().lower()) if row[2].value else None,
            "franchise": str(row[3].value).strip() if row[3].value else None,
            # purple fill marks shows the ledger owners flagged by hand
            "flagged": getattr(row[0].fill.start_color, "rgb", None) == "FF7030A0",
            "votes": [row[5].value or 0, row[6].value or 0],
        }


def main():
    wb = openpyxl.load_workbook(WORKBOOK)
    shows = {}

    for sheet, ledger in SHEETS.items():
        for row in read_rows(wb[sheet]):
            key = slug(row["title"])
            show = shows.setdefault(
                key,
                {
                    "id": key,
                    "title": row["title"],
                    "runtime": None,
                    "format": "series",
                    "franchise": None,
                    "universe": None,
                    "status": "unknown",
                    "flagged": False,
                    "tmdbId": None,
                    "providers": [],
                    "seasons": [],
                    "votes": {l: dict.fromkeys(PEOPLE, 0) for l in SHEETS.values()},
                    "sheets": [],
                },
            )
            show["runtime"] = show["runtime"] or row["runtime"]
            if row["format"]:
                show["format"] = row["format"]
            show["franchise"] = show["franchise"] or row["franchise"]
            show["flagged"] = show["flagged"] or row["flagged"]
            show["sheets"].append(sheet)
            for person, points in zip(PEOPLE, row["votes"]):
                show["votes"][ledger][person] = points

    ordered = sorted(shows.values(), key=lambda s: sort_key(s["title"]))
    budgets = {
        ledger: {
            person: sum(s["votes"][ledger][person] for s in ordered) for person in PEOPLE
        }
        for ledger in SHEETS.values()
    }
    OUT.write_text(
        json.dumps({"people": list(PEOPLE), "budgets": budgets, "shows": ordered}, indent=1) + "\n"
    )

    print(f"{len(ordered)} shows -> {OUT.relative_to(ROOT)}")
    for ledger, spent in budgets.items():
        print(f"  {ledger:7} {spent}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
