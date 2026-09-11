/**
 * Reading back what we stashed in localStorage.
 *
 * Stored state is never trusted: it can be absent, from an older version of
 * the app, or corrupt. Anything unusable falls back to the default rather than
 * reaching the rest of the app, because a bad read here takes the whole page
 * down with it.
 */
export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function parse(store: Storage, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    // Private windows, cleared site data, or half-written JSON.
    return undefined;
  }
}

/** A stored object, with any fields it is missing taken from the default. */
export function loadRecord<T extends object>(store: Storage, key: string, fallback: T): T {
  const value = parse(store, key);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return { ...fallback, ...(value as T) };
}

/**
 * A stored list. Spreading one into an object literal — as the record version
 * does — silently turns [] into {}, which then has no .reduce and takes the
 * page down on the next load. Lists get their own reader for that reason.
 */
export function loadList<T>(store: Storage, key: string): T[] {
  const value = parse(store, key);
  return Array.isArray(value) ? (value as T[]) : [];
}

export function save(store: Storage, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Out of quota or blocked; the app still works, it just will not remember.
  }
}
