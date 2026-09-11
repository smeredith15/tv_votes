# TV Votes

A web app for the weighted show-picking system we used to keep in
`Alternative.xlsx`. Both of you get the same number of points per ballot, spend
them on whatever you want to watch, and a weighted draw picks the winner.

The repo is the database. Every vote, season tick and draw is a commit, so the
whole ledger has a history and there is no server to run or pay for.

## The ballots

| Ballot | What you are voting for |
| --- | --- |
| Half-hour | One series start to finish — or half of it if the run is 6 seasons or more |
| Hour-long | One season at a time |
| Weekly | Friday nights: 2 episodes if it's a half-hour show, 1 if it's an hour |
| Mini / anthology | One season at a time |

Which ballots a show appears on is **derived** from its runtime and format, not
maintained by hand. That is the main thing that changed: the workbook kept the
same list on four sheets, and they had drifted — 39 shows existed on the
hour/half/mini sheets but were missing from Weekly, and 74 rows never got their
30/60 flag typed in, which quietly kept them off the ballot they belonged on.

## Getting set up

1. **Turn on Pages.** Settings → Pages → Source: *GitHub Actions*. Pushing to
   `main` builds and publishes to `https://<you>.github.io/tv_votes/`.
2. **Add a TMDB key.** Create a free one at
   [themoviedb.org](https://www.themoviedb.org/settings/api), then add it as a
   repository secret named `TMDB_API_KEY`. Set the repository variable
   `TMDB_REGION` if you want streaming data for somewhere other than the US.
3. **Give each of you a token.** In the app's Settings tab, paste a
   [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
   scoped to this repo with **Contents: read and write**. It is stored in that
   browser only. Without one you can still read the ledgers; you just can't save.
4. **Run the first refresh.** Actions → *Refresh metadata* → Run workflow, with
   "Refresh every show" ticked. That fills in seasons, streaming services and
   returning/ended status for all 1,015 shows. It takes a few minutes.

## Day to day

- **Vote** — spend your points. The meter shows what you have left, and it says
  *cheater* until you have both spent the same amount, exactly like the
  workbook's `IF(F8=G8, …)` check. Press draw when you are level.
- **Shows** — search and filter the whole list; open any show to tick off
  seasons, fix its runtime or format, or re-pull its details from TMDB.
- **Universes** — the Arrowverse and MCU watch orders, as checklists with a
  bookmark. Both were lifted straight out of the workbook's side columns, so
  your hand-built 818-entry Arrowverse interleave is intact.
- **History** — every draw, with both allocations and the odds each show had.
  The *always a bridesmaid* table is the shows you keep backing that never win.
- **Inbox** — newly premiered shows waiting on a yes or no.

## What runs on its own

`.github/workflows/refresh.yml` runs nightly at 07:00 UTC:

- `scripts/refresh.mjs` re-pulls seasons, streaming providers, and
  returning/ended status, oldest-first, 250 shows a night. Returning shows go
  stale twice as fast, since those are the ones that gain seasons and move
  between services.
- `scripts/discover.mjs` queues shows that premiered in the last two weeks into
  the inbox, skipping reality, talk, news and kids' programming. Nothing reaches
  a ballot without one of you accepting it.

Both commit to `main`, which republishes the site.

## Fairness

Each draw records the seed, the roll, the total ticket count, both allocations
and the full standings. The History tab replays the seed and marks the draw
*verified*, so a result can't be quietly re-rolled.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # 44 tests over the ledger rules, the draw, sync and TMDB parsing
npm run build
```

Re-importing the workbook is possible but destructive — `tools/import_xlsx.py`
rebuilds `data/shows.json` and `data/universes.json` from `Alternative.xlsx` and
would drop any votes cast since. It leaves `history.json` and `inbox.json`
alone.

## Things worth knowing

- **History starts now.** The workbook was a snapshot with no record of past
  draws, so there was nothing to migrate. The first draw in the app is entry one.
- **23 shows are marked started-but-unfinished** (the purple rows). Their
  seasons aren't ticked, because the workbook never recorded which ones you'd
  seen. The *Needs seasons ticked* filter on the Shows tab lists them.
- **The 6-season split is an assumption.** Your description said "the whole
  series if it's 6 or greater seasons, and half of it if it's 6+ seasons", which
  reads as a typo, so it's built as: under 6 seasons, the whole run; 6 or more,
  half the run at a time. Change `LONG_SERIES_SEASONS` in `src/lib/ledgers.ts`
  if the cutoff is different.
- **TMDB status lags reality.** A show cancelled this week may say *Returning*
  for a while. Streaming data comes from JustWatch via TMDB and churns, which is
  why it is refreshed rather than stored once.
- **Points can strand.** Points left on a show that has finished, or that moved
  into a universe, still count against your budget but can never win. The vote
  screen now says so; the workbook never did.
