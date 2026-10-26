// Chapter numbering and labels shared by the six fansub readers. The API splits a
// chapter number into `chapter` and `subchapter` (24/6 is 24.6), volumes-only releases
// use chapter 0, and extras have no number at all.

export interface ChapterNumbering {
  chapter: number | null;
  subchapter?: number | null;
  volume: number | null;
  title: string | null;
  full_title: string;
}

/** 24 + 6 → 24.6; a part without a chapter (`.3`) → 0.3; undefined for extras. */
export function chapterNumber(chapter: ChapterNumbering): number | undefined {
  const sub = chapter.subchapter ?? 0;
  if (chapter.chapter === null && sub <= 0) return undefined;
  const value = Number(sub > 0 ? `${chapter.chapter ?? 0}.${sub}` : chapter.chapter);
  return Number.isFinite(value) ? value : undefined;
}

/** Title for the chapter list: the team's title, or the full title for unnumbered extras. */
export function chapterTitle(chapter: ChapterNumbering): string {
  const title = chapter.title?.trim();
  if (title) return title;
  return chapter.chapter === null ? chapter.full_title.trim() : "";
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
      ? `Capitolo ${number}`
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
