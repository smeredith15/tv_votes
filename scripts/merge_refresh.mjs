/**
 * Three-way merge of the ledger files, for when the branch moves under a
 * running refresh.
 *
 * The app writes votes and watched-season ticks to the same files this job
 * rewrites, at whatever hour someone is on the sofa. If a vote lands while the
 * job is talking to TMDB, the push is rejected — and a blind retry would throw
 * away either the vote or an hour of metadata. So: take the branch as it now
 * stands, and lay back over it only the fields this job owns.
 *
 *   node scripts/merge_refresh.mjs <base-dir> <ours-dir>
 *
 * base-dir  the files as checked out, before this job touched them
 * ours-dir  the files as this job left them
 * The merge is written into ./data, which must already hold the branch's
 * current contents.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Fields only the refresh job ever sets, so ours always wins. */
const METADATA = ["status", "nextAirDate", "providers", "providersUpdated"];

/** Fields the refresh only fills in when empty, so a human's answer wins. */
const FILL_IF_EMPTY = ["tmdbId", "runtime", "poster"];

const read = (dir, name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const write = (name, value) => writeFileSync(join("data", name), `${JSON.stringify(value, null, 1)}\n`);

/** Season list comes from TMDB; which of them you have watched does not. */
function mergeSeasons(ourSeasons = [], theirSeasons = []) {
  const watched = new Map(theirSeasons.map((s) => [s.number, s.watched]));
  return ourSeasons.map((season) => ({ ...season, watched: watched.get(season.number) ?? season.watched }));
}

export function mergeShows(base, ours, theirs) {
  const ourShows = new Map(ours.shows.map((s) => [s.id, s]));
  const baseIds = new Set(base.shows.map((s) => s.id));

  // Start from the branch: it holds the votes, and any show added or dropped
  // from the inbox while this job was running.
  const shows = theirs.shows.map((their) => {
    const our = ourShows.get(their.id);
    if (!our) return their;

    const merged = { ...their };
    for (const field of METADATA) {
      if (our[field] !== undefined) merged[field] = our[field];
    }
    for (const field of FILL_IF_EMPTY) {
      if (merged[field] === null || merged[field] === undefined) merged[field] = our[field];
    }
    if (our.seasons?.length) merged.seasons = mergeSeasons(our.seasons, their.seasons);
    return merged;
  });

  // A show this job added (never in the base, not on the branch) still belongs.
  const theirIds = new Set(theirs.shows.map((s) => s.id));
  for (const our of ours.shows) {
    if (!theirIds.has(our.id) && !baseIds.has(our.id)) shows.push(our);
  }

  return { ...theirs, shows };
}

/** Older files were a bare array; newer ones carry the refusals alongside. */
function inboxParts(value) {
  return Array.isArray(value)
    ? { pending: value, dismissed: [] }
    : { pending: value.pending ?? [], dismissed: value.dismissed ?? [] };
}

export function mergeInbox(baseRaw, oursRaw, theirsRaw) {
  const base = inboxParts(baseRaw);
  const ours = inboxParts(oursRaw);
  const theirs = inboxParts(theirsRaw);

  const baseIds = new Set(base.pending.map((i) => i.tmdbId));
  const theirIds = new Set(theirs.pending.map((i) => i.tmdbId));
  const dismissed = new Set([...theirs.dismissed, ...ours.dismissed]);

  // Only suggestions this run turned up, and only ones not since turned down.
  const fresh = ours.pending.filter(
    (i) => !baseIds.has(i.tmdbId) && !theirIds.has(i.tmdbId) && !dismissed.has(i.tmdbId),
  );
  return { pending: [...theirs.pending, ...fresh], dismissed: [...dismissed] };
}

function main() {
  const [baseDir, oursDir] = process.argv.slice(2);
  if (!baseDir || !oursDir) throw new Error("Usage: merge_refresh.mjs <base-dir> <ours-dir>");

  const shows = mergeShows(read(baseDir, "shows.json"), read(oursDir, "shows.json"), read("data", "shows.json"));
  const inbox = mergeInbox(read(baseDir, "inbox.json"), read(oursDir, "inbox.json"), read("data", "inbox.json"));

  write("shows.json", shows);
  write("inbox.json", inbox);
  console.log(`Merged onto the branch: ${shows.shows.length} shows, ${inbox.length} in the inbox.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
