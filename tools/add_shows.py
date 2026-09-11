"""Add shows to the ledger, marked as already watched.

Used for shows finished before the workbook existed: they were never on it,
because there was nothing left to vote for. They still belong in the list —
for the totals, and so a new season can bring them back.

Seasons are not known until TMDB fills them in, so each show is flagged
`assumeWatched` and the refresh ticks off whatever had already aired.

    python3 tools/add_shows.py < already-watched.txt
    python3 tools/add_shows.py --unwatched < new-to-the-list.txt

`--unwatched` adds them as anything else on the list: never seen, and votable.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOWS = ROOT / "data" / "shows.json"
LEDGERS = ("weekly", "hour", "half", "mini")


def match_key(title):
    stripped = re.sub(r"^(the|a|an)\s+", "", str(title).strip(), flags=re.I)
    return re.sub(r"[^a-z0-9]+", "", stripped.lower())


def slugify(title):
    stripped = re.sub(r"^(the|a|an)\s+", "", str(title).strip(), flags=re.I)
    return re.sub(r"[^a-z0-9]+", "-", stripped.lower()).strip("-")


def main():
    watched = "--unwatched" not in sys.argv
    titles = [line.strip() for line in sys.stdin if line.strip()]
    file = json.loads(SHOWS.read_text())
    shows = file["shows"]
    people = file["people"]
    by_key = {match_key(s["title"]): s for s in shows}

    added, marked = [], []
    for title in titles:
        existing = by_key.get(match_key(title))
        if existing:
            if watched:
                existing["assumeWatched"] = True
                marked.append(existing["title"])
            continue

        show = {
            "id": slugify(title),
            "title": title,
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
            "votes": {l: {p: 0 for p in people} for l in LEDGERS},
            "addedAt": "2026-09-11T00:00:00.000Z",
        }
        if watched:
            # Everything aired so far counts as seen; the refresh ticks it off.
            show["assumeWatched"] = True
        shows.append(show)
        by_key[match_key(title)] = show
        added.append(title)

    shows.sort(key=lambda s: match_key(s["title"]))
    SHOWS.write_text(json.dumps(file, indent=1) + "\n")

    how = "as already watched" if watched else "as unwatched"
    print(f"added {len(added)} {how}, flagged {len(marked)} already on the list")
    print(f"total shows: {len(shows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
