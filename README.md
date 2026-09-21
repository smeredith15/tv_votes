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

A show with every aired season ticked off is on no ballot at all — there is
nothing to vote for. It is not gone: when a season airs, the refresh adds it
unwatched and the show is back on the ballots, or picks itself up if its *auto*
tick is set.

Which ballots a show appears on is otherwise **derived** from its runtime and
format, not maintained by hand. That is the main thing that changed: the workbook kept the
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
  Friday nights how many Fridays that is. Tick a season off from here. Keeping a
  draw puts that ballot on the show it landed on, and any ballot can also be
  pointed at a show by hand, or cleared. Alongside it, **on the side** is a list
  for whatever you are watching outside the voting altogether.
- **Vote** — pick who is voting at the top: with a name selected, the other
  person's points, totals and picks are all hidden, so neither of you can
  counter-bid from the same chair. Switch to *Both* when you are done. There is
  no budget to spend up to: the bars are drawn against whichever of you has
  placed more, and it says *cheater* until the two totals match, exactly like
  the workbook's `IF(F8=G8, …)` check.
  Every show the ballot could land on is listed, the ones you are backing first,
  fifty at a time — so points can be placed by browsing rather than having to
  know a title to search for.
  Drawing spins through four other shows before it lands — each one a real
  weighted draw, so the near-misses are shows that genuinely could have come
  up. Nothing reaches the history until you press *Keep it*, so an idle
  "what would we get?" costs nothing.
- **Shows** — search and filter the whole list; open any show to tick off
  seasons, fix its runtime or format, or re-pull its details from TMDB.
  *Add a show* takes a TMDB id, a link to its TMDB page, or just a name —
  handy when two shows share a title, since the search lets you pick the right
  one. Everything the nightly refresh would work out comes down with it, so an
  added show is on the right ballots immediately. Tick the box if you have
  already watched all of it.
- **Watched & Plex** — every show, each with two rows of seasons: the ones you
  have watched and the ones sitting on Plex. Filters narrow it to what you have
  started, what a draw has picked, or what is missing from the server, and the
  search reaches the whole list. A show that is returning also carries an *auto*
  tick: with it on, a new season turns up under Now watching instead of going
  back to a vote, and the show stays off the ballots.
- **Universes** — the Arrowverse and MCU watch orders, as checklists with a
  bookmark. Both were lifted straight out of the workbook's side columns, so
  your hand-built 818-entry Arrowverse interleave is intact.
- **History** — the numbers (who is running hot, how much television this has
  amounted to, the longest wait), then every draw you kept, with both
  allocations and the odds each show had. The *always a bridesmaid* table is the shows you keep backing that
  never win. Any single draw can be deleted, or the lot cleared, each behind a
  confirmation.
- **Inbox** — newly premiered shows waiting on a yes or no. A show turned down
  is remembered, so the nightly job does not offer it again; the count of those
  is shown, with a button to put them all back in circulation.

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

`data/plex.json` records which seasons are on the server. Ticking them by hand
under *Watched & Plex* is the intended way. There is also a script, if the
library ever grows faster than the ticking:

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

## Installing it

The site is a progressive web app: Chrome and Edge offer an *Install* button
under Settings, and Safari does it through Share → Add to Home Screen. Installed,
it opens in its own window with its own icon.

A service worker keeps it working without a connection — the ledgers show as
they were last loaded, and votes queue up until there is a connection to save
them through. The caching is deliberately narrow: only files whose names already
contain a hash of their contents are served from the cache first. Pages and data
go to the network and fall back to the cache only when the network cannot
answer, and anything off this origin — GitHub, TMDB, posters — the worker never
touches at all, so a save is never answered out of a cache.

`tools/make_icons.py` draws the icons; run it if the artwork should change.

## When a deploy does not seem to have landed

GitHub Pages serves `index.html` with ten minutes of caching, so a browser can
keep running the previous bundle well after a deploy — which looks exactly like
the deploy having failed.

The app checks for this itself: `version.json` records the bundle's file name,
and the running page compares it against its own (`import.meta.url`) on open and
whenever you come back to the tab. If a newer one is out, a banner offers to
load it.

The bundle, not the commit. Every vote saved from the app is a commit, and each
one redeploys — so a commit-based check called the app stale the moment anyone
saved anything, while it was byte for byte the same. Vite content-hashes the
bundle, and nothing about the build is compiled into it, so its name changes
when the app changes and not otherwise.

A hard refresh (Ctrl/Cmd-Shift-R) does the same thing by hand. The service
worker does not get in the way of this: `version.json` is left to reach the
network, and the reload pulls the new bundle even when the worker is in charge.

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
- **Adding shows** is `tools/add_shows.py`, reading titles on stdin. By default
  they go in as already watched — flagged `assumeWatched`, so the next refresh
  ticks off every season that had aired and clears the flag, leaving anything
  later unwatched, which is what makes the *auto* tick useful. Pass
  `--unwatched` to add them the ordinary way, never seen and votable.
- **A show added by hand needs a TMDB key.** Settings holds it, and the *Add a
  show* panel uses it to fetch the details.
- **A show added any other way reaches the Weekly ballot first.** The hour and
  half-hour ballots are decided by runtime, which nothing knows until TMDB is
  asked — so a title added by `tools/add_shows.py` is weekly-only until the next
  refresh. Adding through the app avoids that, since it fetches the runtime then
  and there.
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
