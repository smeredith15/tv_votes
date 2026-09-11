/**
 * Title handling, matching how the workbook importer built the list so that
 * shows added later sort and key the same way as the original 1,015.
 */
const ARTICLE = /^(the|a|an)\s+/i;

/** "The 100" and "100, The" both key to "100". */
export function sortKey(title: string): string {
  return title.replace(/,\s*(the|a|an)$/i, "").replace(ARTICLE, "").toLowerCase();
}

export function slugify(title: string): string {
  return sortKey(title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Where a title belongs in an alphabetised list. */
export function insertionIndex(titles: string[], title: string): number {
  const key = sortKey(title);
  const at = titles.findIndex((existing) => sortKey(existing) > key);
  return at === -1 ? titles.length : at;
}
