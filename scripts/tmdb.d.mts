import type { Provider, ReturningStatus, Runtime, Season, ShowFormat } from "../src/lib/types";

export const IMAGE_BASE: string;

export interface TmdbSearchResult {
  id: number;
  name: string;
  original_name?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  popularity?: number;
}

export interface TmdbClient {
  search(title: string, year?: number): Promise<TmdbSearchResult[]>;
  details(id: number): Promise<Record<string, unknown>>;
  providers(id: number): Promise<Record<string, unknown> | null>;
  discover(from: string, to: string, page?: number): Promise<{ results: TmdbSearchResult[]; total_pages: number }>;
}

export function createClient(options: { key: string; region?: string; fetchImpl?: typeof fetch }): TmdbClient;
export function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>;
export function toReturningStatus(tmdb: unknown): ReturningStatus;
export function toRuntime(tmdb: unknown): Runtime;
export function toFormat(tmdb: unknown, current?: ShowFormat): ShowFormat;
export function toProviders(entry: unknown): Provider[];
export function toSeasons(tmdb: unknown, existing?: Season[]): Season[];
export function matchKey(title: string): string;
export function bestMatch(title: string, results: TmdbSearchResult[]): TmdbSearchResult | null;
