// Chapter numbering and labels shared by the six fansub readers. The API splits a
// chapter number into `chapter` and `subchapter` (24/6 is part 6 of chapter 24),
// volumes-only releases use chapter 0, and extras have no number at all.
//
// Parts 1-9 read as decimals (24/6 → 24.6). From part 10 a decimal would be ambiguous
// (24/10 and 24/1 are both 24.1), so the number stays 24 and the title says "Parte 10";
// the chapter list order comes from `sortingIndex`, i.e. the API's own order.

export interface ChapterNumbering {
  chapter: number | null;
  subchapter?: number | null;
  volume: number | null;
  title: string | null;
  full_title: string;
}

const MAX_DECIMAL_PART = 9;

function partOf(chapter: ChapterNumbering): number {
  const sub = chapter.subchapter ?? 0;
  return sub > 0 ? sub : 0;
}

/** 24 + 6 → 24.6; 24 + 10 → 24; a part without a chapter (`.3`) → 0.3; undefined for extras. */
export function chapterNumber(chapter: ChapterNumbering): number | undefined {
  const part = partOf(chapter);
  if (chapter.chapter === null && part === 0) return undefined;
  const base = chapter.chapter ?? 0;
  const value = part > 0 && part <= MAX_DECIMAL_PART ? Number(`${base}.${part}`) : base;
  return Number.isFinite(value) ? value : undefined;
}

/** "24.6", "24.10": the number as the team writes it, for labels only (never sorted). */
function displayNumber(chapter: ChapterNumbering): string | undefined {
  const part = partOf(chapter);
  if (chapter.chapter === null && part === 0) return undefined;
  return part > 0 ? `${chapter.chapter ?? 0}.${part}` : String(chapter.chapter);
}

/**
 * Title for the chapter list: the team's title, or the full title for unnumbered extras.
 * Parts from 10 up carry "Parte N", which their chapter number cannot show.
 */
export function chapterTitle(chapter: ChapterNumbering): string {
  const title =
    chapter.title?.trim() || (chapter.chapter === null ? chapter.full_title.trim() : "");
  const part = partOf(chapter);
  if (part <= MAX_DECIMAL_PART) return title;
  return title ? `Parte ${part} · ${title}` : `Parte ${part}`;
}

/**
 * One label for Home carousels: "Capitolo 63 · Eeek!", "Volume 4" for volume-only
 * releases (chapter 0 inside a volume), or the extra's own title ("Artbook").
 */
export function chapterLabel(chapter: ChapterNumbering): string {
  const title = chapter.title?.trim().replace(/^"(.*)"$/u, "$1") ?? "";
  const number = chapterNumber(chapter);
  const volumeOnly = !number && (chapter.volume ?? 0) > 0;
  const base = volumeOnly
    ? `Volume ${chapter.volume}`
    : number !== undefined
      ? `Capitolo ${displayNumber(chapter)}`
      : "";
  if (!base) return title || chapter.full_title.trim();
  return title && !/^(?:vol\.?\s*)?\d+$/iu.test(title) ? `${base} · ${title}` : base;
}

/** Case- and accent-insensitive match on title, alternative titles and author. */
export function matchesQuery(
  comic: { title: string; alt_titles?: string[] | null; author?: string | null },
  query: string,
): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  const haystack = normalize(
    [comic.title, ...(comic.alt_titles ?? []), comic.author ?? ""].join(" "),
  );
  return haystack.includes(needle);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}
