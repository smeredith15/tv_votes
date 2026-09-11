/** The four ballots. Which ones a show appears on is derived, never typed in. */
export type LedgerId = "weekly" | "hour" | "half" | "mini";

export type PersonId = string;

/** Runtime bucket. Anything 40 minutes or over counts as an hour show. */
export type Runtime = 30 | 60 | null;

export type ShowFormat = "series" | "mini" | "anthology" | "documentary" | "limited";

/** TMDB's status, collapsed to what actually matters when picking a show. */
export type ReturningStatus = "returning" | "ended" | "unknown";

export type WatchState = "unwatched" | "in_progress" | "complete";

export interface Season {
  number: number;
  name?: string;
  episodes: number;
  airDate?: string | null;
  watched: boolean;
}

export interface Provider {
  name: string;
  /** flatrate = included with a subscription; the rest cost extra. */
  type: "flatrate" | "free" | "ads" | "rent" | "buy";
  logo?: string | null;
}

export interface Show {
  id: string;
  title: string;
  runtime: Runtime;
  format: ShowFormat;
  franchise: string | null;
  /** Set when the show is watched as part of a combined universe instead. */
  universe: string | null;
  /** True on the one show that carries the votes for a whole universe. */
  universeEntry?: boolean;
  /** Carried over from the workbook as started-but-unfinished, seasons unticked. */
  startedNotFinished?: boolean;
  /**
   * When a new season turns up, start watching it rather than putting it back
   * to a vote. A show set this way stays off the ballots.
   */
  autoResume?: boolean;
  /** Added as already finished; the next refresh ticks off what had aired. */
  assumeWatched?: boolean;
  status: ReturningStatus;
  /** Premiere date of the next season, when one is scheduled. */
  nextAirDate?: string | null;
  tmdbId: number | null;
  poster?: string | null;
  providers: Provider[];
  providersUpdated?: string | null;
  seasons: Season[];
  votes: Record<LedgerId, Record<PersonId, number>>;
  /** Set by hand when a show should never appear on a given ballot. */
  exclude?: LedgerId[];
  addedAt?: string;
  notes?: string;
}

/** One completed draw. Everything needed to re-verify the result later. */
export interface Draw {
  id: string;
  ledger: LedgerId;
  drawnAt: string;
  /** Each person's full allocation at the moment of the draw. */
  allocations: Record<PersonId, Record<string, number>>;
  totalWeight: number;
  /** The winning ticket, in [1, totalWeight]. */
  roll: number;
  seed: string;
  winnerId: string;
  winnerTitle: string;
  /** The season(s) the winner was on the ballot for. */
  ballot?: string;
  /** Every show that had points, richest first, for the near-miss history. */
  standings: { id: string; title: string; weight: number }[];
}

/** A show TMDB suggested that nobody has ruled on yet. */
export interface InboxItem {
  tmdbId: number;
  title: string;
  firstAirDate?: string | null;
  overview?: string;
  poster?: string | null;
  network?: string | null;
  runtime: Runtime;
  suggestedAt: string;
}

export interface UniverseItem {
  /** "Arrow S01E01 Pilot", "Iron Man", "Loki S01" — as written in the order. */
  label: string;
  watched: boolean;
}

export interface Universe {
  id: string;
  name: string;
  /** The show row that holds this universe's points on the ballots. */
  entryShowId: string;
  order: UniverseItem[];
}

/**
 * Which seasons of a show are sitting on the Plex server, keyed by show id.
 * Kept in its own file: it is regenerated wholesale by the sync script and has
 * nothing to do with how anyone voted.
 */
export interface PlexLibrary {
  updatedAt: string | null;
  /** Show id -> the season numbers present. An empty list means none. */
  shows: Record<string, number[]>;
}

/** What is being watched right now, and what is queued outside the voting. */
export interface Watching {
  /** The show each ballot is on. Set by keeping a draw, or chosen by hand. */
  picks: Partial<Record<LedgerId, string | null>>;
  /** Shows being watched outside the voting framework, in the order added. */
  asides: string[];
}

export interface Dataset {
  people: PersonId[];
  displayNames?: Record<PersonId, string>;
  shows: Show[];
  universes: Universe[];
  history: Draw[];
  inbox: InboxItem[];
  plex: PlexLibrary;
  watching: Watching;
  updatedAt?: string;
}
