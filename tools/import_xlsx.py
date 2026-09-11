"""Import Alternative.xlsx into the app's four JSON ledger files.

The workbook keeps four sheets (Weekly / 60 / 30 / Mini) that each repeat the
same show list with a per-person point allocation, plus two hand-built
combined-universe watch orders tucked into the side columns of the 60 sheet.

The sheets have drifted out of sync over the years, so this merges them into a
single show table; which ballots a show appears on is derived from its runtime
and format instead of being maintained by hand.

    python3 tools/import_xlsx.py
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "Alternative.xlsx"
DATA = ROOT / "data"

# sheet name -> ledger id. Columns F and G hold the two point allocations.
SHEETS = {"Weekly": "weekly", "60": "hour", "30": "half", "Mini": "mini"}
PEOPLE = ("scotty", "shelby")

# The 30 and 60 sheets are themselves a statement of runtime.
SHEET_RUNTIME = {"30": 30, "60": 60}
DISPLAY_NAMES = {"scotty": "Scotty", "shelby": "Shelby"}

# "Mini" column values seen in the workbook -> canonical format
FORMATS = {
    "mini": "mini",
    "documentary": "documentary",
    "anthology/sketch/documentary": "anthology",
    "1": "limited",  # one-and-done / single season
}

# Purple fill in the workbook marks a show they started but have not finished.
IN_PROGRESS_FILL = "FF7030A0"

ARTICLES = ("The", "A", "An")

# Titles that normalise to the same key as a universe entry but are a different
# show: the MCU's "What If...?" is not the "WHAT / IF" on the ledger.
NOT_UNIVERSE_MEMBERS = {("mcu", "what-if")}


def display_title(raw):
    """'100, The' -> 'The 100'. The workbook stores titles sort-first."""
    title = str(raw).replace("\t", " ").strip()
    for article in ARTICLES:
        suffix = ", " + article
        if title.endswith(suffix):
            return f"{article} {title[: -len(suffix)]}"
    return title


def match_key(title):
    """Strip articles and punctuation so titles compare across spellings."""
    stripped = re.sub(r"^(the|a|an)\s+", "", str(title).strip(), flags=re.I)
    return re.sub(r"[^a-z0-9]+", "", stripped.lower())


def slug(title):
    stripped = re.sub(r"^(the|a|an)\s+", "", str(title).strip(), flags=re.I)
    return re.sub(r"[^a-z0-9]+", "-", stripped.lower()).strip("-")


def read_rows(ws):
    for row in ws.iter_rows(min_row=10, max_col=7):
        if row[0].value is None:
            continue
        yield {
            "title": display_title(row[0].value),
            "runtime": row[1].value if row[1].value in (30, 60) else None,
            "format": FORMATS.get(str(row[2].value).strip().lower()) if row[2].value else None,
            "franchise": str(row[3].value).strip() if row[3].value else None,
            "in_progress": getattr(row[0].fill.start_color, "rgb", None) == IN_PROGRESS_FILL,
            "votes": [row[5].value or 0, row[6].value or 0],
        }


def read_universes(ws):
    """The Arrowverse and MCU watch orders live in the 60 sheet's J and K columns."""
    universes = []
    for column, universe_id in (("J", "arrowverse"), ("K", "mcu")):
        name = ws[f"{column}3"].value
        order = [
            {"label": str(ws[f"{column}{r}"].value).strip(), "watched": False}
            for r in range(4, ws.max_row + 1)
            if ws[f"{column}{r}"].value
        ]
        universes.append({"id": universe_id, "name": name, "entryShowId": universe_id, "order": order})
    return universes


def series_in(universe):
    """Series names appearing in a watch order, e.g. 'Arrow S01E01 Pilot' -> 'Arrow'."""
    names = set()
    for item in universe["order"]:
        found = re.match(r"^(.*?)\s+S\d{2}(E\d{2})?\b", item["label"])
        if found:
            names.add(found.group(1))
    return names


def build_shows(wb):
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
                    "tmdbId": None,
                    "poster": None,
                    "providers": [],
                    "providersUpdated": None,
                    "seasons": [],
                    "votes": {l: dict.fromkeys(PEOPLE, 0) for l in SHEETS.values()},
                },
            )
            # Rows added late often never got their 30/60 flag typed in, but the
            # sheet they were added to says which it is.
            show["runtime"] = show["runtime"] or row["runtime"] or SHEET_RUNTIME.get(sheet)
            if row["format"]:
                show["format"] = row["format"]
            elif sheet == "Mini" and show["format"] == "series":
                # Likewise: on the Mini sheet with no flag means a new miniseries.
                show["format"] = "mini"
            show["franchise"] = show["franchise"] or row["franchise"]
            if row["in_progress"]:
                # Seasons are not known until TMDB fills them in, so record the
                # fact and let the app ask which seasons are already done.
                show["startedNotFinished"] = True
            for person, points in zip(PEOPLE, row["votes"]):
                show["votes"][ledger][person] = points
    return shows


def main():
    wb = openpyxl.load_workbook(WORKBOOK)
    shows = build_shows(wb)
    universes = read_universes(wb["60"])

    # Shows watched inside a universe are voted on as part of that universe,
    # not individually, so point them at it.
    linked = 0
    by_key = {match_key(s["title"]): s for s in shows.values()}
    for universe in universes:
        entry = shows.get(universe["entryShowId"])
        if entry:
            entry["universe"] = universe["id"]
            entry["universeEntry"] = True
        for name in series_in(universe):
            member = by_key.get(match_key(name))
            if member and (universe["id"], member["id"]) in NOT_UNIVERSE_MEMBERS:
                continue
            if member and not member.get("universeEntry"):
                member["universe"] = universe["id"]
                linked += 1

    ordered = sorted(shows.values(), key=lambda s: match_key(s["title"]))
    budgets = {
        ledger: max(sum(s["votes"][ledger][p] for s in ordered) for p in PEOPLE)
        for ledger in SHEETS.values()
    }

    DATA.mkdir(exist_ok=True)
    write(DATA / "shows.json", {
        "people": list(PEOPLE),
        "displayNames": DISPLAY_NAMES,
        "budgets": budgets,
        "shows": ordered,
    })
    write(DATA / "universes.json", universes)
    for name in ("history.json", "inbox.json"):
        path = DATA / name
        if not path.exists():  # never clobber real vote history on a re-import
            write(path, [])

    print(f"{len(ordered)} shows, {linked} linked to a universe")
    print(f"budgets: {budgets}")
    print(f"started but unfinished: {sum(1 for s in ordered if s.get('startedNotFinished'))}")
    return 0


def write(path, value):
    path.write_text(json.dumps(value, indent=1) + "\n")


if __name__ == "__main__":
    sys.exit(main())
