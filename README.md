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
   `main` then publishes to `https://smeredith15.github.io/tv_votes/`. See
   [Hosting](#hosting) for why the repo is public.
2. **Add a TMDB key.** Create a free one at
   [themoviedb.org](https://www.themoviedb.org/settings/api), then add it under
   Settings → Secrets and variables → Actions → **Repository secrets** → New
   repository secret, named exactly `TMDB_API_KEY`. It has to be a *secret*, not
   a variable, and not an environment secret — and the TMDB field in the app's
   own Settings tab is a separate thing, used only by the per-show refresh
   button. Set the repository variable `TMDB_REGION` for streaming data outside
   the US.
3. **Add a token.** In the app's Settings tab, paste a
   [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
   scoped to this repo with **Contents: read and write**. It is stored in that
   browser only. Without one you can still read the ledgers; you just can't save.
   One token per computer is enough — you both vote from the same one, and the
   *who's voting* switch on the Vote page keeps your picks apart.
4. **Run the first refresh.** Actions → *Refresh metadata* → Run workflow, with
   "Refresh every show" ticked. That fills in seasons, streaming services and
   returning/ended status for all 1,015 shows. It takes a few minutes.

## Hosting

The app is served by **GitHub Pages** from this repo: Settings → Pages →
Source: *GitHub Actions*, after which `.github/workflows/deploy.yml` publishes
to `https://smeredith15.github.io/tv_votes/` on every push to `main`. That
build sets `PUBLISH_DATA=1`, so the ledgers ship alongside the app and it opens
read-only without anyone pasting a token in.

Pages will not serve a **private** repo without a paid plan, which is why this
one is public. Everything in `data/` — the show list, both point allocations,
the draw history — is world-readable as a result. No tokens or API keys are in
the repo, and none ever were.

If you would rather it were private again, the build already supports it: the
default `npm run build` ships **no data at all**, so the site can go on any free
static host (Cloudflare Pages, Netlify, Vercel — all accept private repos) while
the app reads and writes the private repo through the GitHub API with the token
in Settings. The deployed files would then be nothing but code.

Locally, `npm run dev` serves it at `localhost:5173` and reads `data/` off disk.

## Day to day

- **Now watching** — what you are in the middle of, one card per ballot: the
  season you are on, where it is streaming, how many episodes are left, and for
  Friday nights how many Fridays that is. Tick a season off from here.
- **Vote** — pick who is voting at the top: with a name selected, the other
  person's points, totals and picks are all hidden, so neither of you can
  counter-bid from the same chair. Switch to *Both* when you are done. The meter
  shows what you have left, and it says *cheater* until you have both spent the
  same amount, exactly like the workbook's `IF(F8=G8, …)` check.
  Drawing spins through four other shows before it lands — each one a real
  weighted draw, so the near-misses are shows that genuinely could have come
  up. Nothing reaches the history until you press *Keep it*, so an idle
  "what would we get?" costs nothing.
- **Shows** — search and filter the whole list; open any show to tick off
  seasons, fix its runtime or format, or re-pull its details from TMDB.
- **Watched & Plex** — the fast way to tick seasons off: a worklist of what you
  have started and not finished, with a switch between marking what you have
  *watched* and what is *on the server*. Both are the same gesture over the same
  grid, so they share a screen.
- **Universes** — the Arrowverse and MCU watch orders, as checklists with a
  bookmark. Both were lifted straight out of the workbook's side columns, so
  your hand-built 818-entry Arrowverse interleave is intact.
- **History** — the numbers (who is running hot, how much television this has
  amounted to, the longest wait), then every draw you kept, with both
  allocations and the odds each show had. The *always a bridesmaid* table is the shows you keep backing that
  never win. Any single draw can be deleted, or the lot cleared, each behind a
  confirmation.
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

## Plex

`data/plex.json` records which seasons are on the server. You can tick them by
hand under *Watched & Plex*, or let the server tell you:

```sh
PLEX_URL=http://192.168.1.10:32400 PLEX_TOKEN=xxxx npm run plex
```

That reads every TV section, matches it against the show list — by the TMDB id
Plex recorded where there is one, by title otherwise — and rewrites
`data/plex.json` for you to commit. Add `--dry-run` to see what it would write
first. It also prints anything on the server that is not on the ledger.

This one cannot run in the nightly job: that runs on GitHub's machines, which
cannot reach a server on your home network. Run it on a machine that can, when
the library has changed enough to be worth it. Re-running replaces the file, so
anything ticked by hand is overwritten.

The token is the `X-Plex-Token` on any request the Plex web app makes. It is
only ever sent to your own server, and nothing puts it in the repo.

## When a deploy does not seem to have landed

GitHub Pages serves `index.html` with ten minutes of caching, so a browser can
keep running the previous bundle well after a deploy — which looks exactly like
the deploy having failed.

The app now checks for this itself: each build is stamped with its commit, and
the running page compares that against `version.json` (fetched past the cache)
on open and whenever you come back to the tab. If a newer one is out, a banner
offers to load it. Settings shows which build you are on, so it can always be
checked against the newest commit on `main`.

A hard refresh (Ctrl/Cmd-Shift-R) does the same thing by hand.

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
- **Points on a finished show are already out of the draw.** The cheater check
  measures what the draw will actually use, not the raw column total — the two
  were the same in the workbook, which had no way for a show to drop off, but
  here a finished show stops being drawable while its points sit there. The vote
  screen offers to take those back so you can spend them on something that can
  win, and doing so does not move the balance, because they were not counting
  toward it.
- **Win share splits the credit.** A show you both backed is not a whole win for
  either of you: each draw is divided by how much of the winner's tickets each
  of you paid for. Over a handful of draws it is mostly luck, which is why the
  panel shows it against what each of you spent.
