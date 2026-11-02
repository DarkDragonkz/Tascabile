// Juin Jutsu Team runs FoOlSlide, whose JSON reader API (/api/reader/…) exposes the
// catalogue, the latest chapters, each series with its chapters and each chapter's pages.
// Parsing stays free of Paperback runtime calls so it can be tested offline.

export const BASE_URL = "https://www.juinjutsureader.ovh";
export const API_URL = `${BASE_URL}/api/reader`;

/** Parts 1-9 read as decimals (26.1); from 10 up a decimal would be ambiguous. */
const MAX_DECIMAL_PART = 9;

interface ApiComic {
  id: number;
  name: string;
  stub: string;
  author?: string;
  artist?: string;
  description?: string;
  adult?: string;
  created?: string;
  updated?: string;
  thumb_url?: string;
  fullsized_thumb_url?: string;
}

interface ApiChapter {
  id: number;
  chapter: string;
  subchapter: string;
  volume: string;
  name?: string;
  created?: string;
  hidden?: string;
}

interface ApiPage {
  filename: string;
  url: string;
  hidden?: string;
}

export interface JuinComic {
  mangaId: string;
  title: string;
  author: string;
  artist: string;
  synopsis: string;
  thumbnailUrl: string;
  coverUrl: string;
  adult: boolean;
  createdAt?: Date;
}

export interface JuinChapter {
  chapterId: string;
  /** The team's chapter title, "" when there is none (Paperback shows the number). */
  title: string;
  /** "Capitolo 59: Futuri mutevoli", for Home carousels. */
  label: string;
  chapNum: number;
  /** Chapter and part as FoOlSlide stores them (26/10), used for ordering. */
  chapter: number;
  part: number;
  volume?: number;
  publishDate?: Date;
}

export interface JuinUpdate {
  comic: JuinComic;
  chapter: JuinChapter;
}

/** Parses the JSON body, turning the API's `{ "error": … }` replies into readable errors. */
export function parseJson<T>(raw: string): T {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Juin Jutsu: risposta non valida dal reader.");
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(`Juin Jutsu: ${String((data as { error: unknown }).error)}`);
  }
  return data as T;
}

export function parseComicList(raw: string): JuinComic[] {
  return (parseJson<{ comics?: ApiComic[] }>(raw).comics ?? []).map(toComic);
}

/** Latest chapters, newest first, skipping hidden ones. */
export function parseLatestChapters(raw: string): JuinUpdate[] {
  const { chapters = [] } = parseJson<{
    chapters?: { comic: ApiComic; chapter: ApiChapter }[];
  }>(raw);
  return chapters
    .filter((entry) => entry.chapter.hidden !== "1")
    .map((entry) => ({ comic: toComic(entry.comic), chapter: toChapter(entry.chapter) }));
}

/** Series details and chapters, newest first (the API lists them oldest first). */
export function parseComicDetails(raw: string): { comic: JuinComic; chapters: JuinChapter[] } {
  const data = parseJson<{ comic: ApiComic; chapters?: { chapter: ApiChapter }[] }>(raw);
  const chapters = (data.chapters ?? [])
    .map((entry) => entry.chapter)
    .filter((chapter) => chapter.hidden !== "1")
    .map(toChapter)
    // By chapter, then part (26/10 after 26/2), never by the decimal alone.
    .sort((a, b) => b.chapter - a.chapter || b.part - a.part || (b.volume ?? 0) - (a.volume ?? 0));
  return { comic: toComic(data.comic), chapters };
}

/** Page images in reading order: filenames are zero-padded (00.jpg, 01.png, 04-05.png…). */
export function parseChapterPages(raw: string): string[] {
  const { pages = [] } = parseJson<{ pages?: ApiPage[] }>(raw);
  return pages
    .filter((page) => page.hidden !== "1" && page.url)
    .sort((a, b) => a.filename.localeCompare(b.filename, "en", { numeric: true }))
    .map((page) => https(page.url));
}

/** Case- and accent-insensitive title match used by the local search. */
export function matchesQuery(comic: JuinComic, query: string): boolean {
  const needle = normalize(query);
  return !needle || normalize(`${comic.title} ${comic.author} ${comic.artist}`).includes(needle);
}

/** FoOlSlide dates are "YYYY-MM-DD HH:MM:SS" in Italian time; the zero date means unknown. */
export function parseDate(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u);
  if (!match || match[1] === "0000") return undefined;
  const [, year, month, day, hour, minute, second] = match.map(Number) as number[];
  const date = new Date(year!, month! - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toComic(comic: ApiComic): JuinComic {
  return {
    mangaId: comic.stub,
    title: decodeEntities(comic.name).trim(),
    author: comic.author?.trim() ?? "",
    artist: comic.artist?.trim() ?? "",
    synopsis: cleanSynopsis(comic.description ?? ""),
    thumbnailUrl: https(comic.thumb_url || comic.fullsized_thumb_url || ""),
    coverUrl: https(comic.fullsized_thumb_url || comic.thumb_url || ""),
    adult: comic.adult === "1",
    createdAt: parseDate(comic.created),
  };
}

function toChapter(chapter: ApiChapter): JuinChapter {
  const main = Number(chapter.chapter) || 0;
  const sub = Number(chapter.subchapter) || 0;
  // FoOlSlide stores 26.1 as chapter 26, subchapter 1 (and 166.5 as 166/5). From part 10
  // a decimal would collide (26/10 and 26/1 are both 26.1): the number stays 26 and the
  // title says "Parte 10", while the order uses chapter and part.
  const decimal = sub > 0 && sub <= MAX_DECIMAL_PART;
  const chapNum = decimal ? Number(`${main}.${sub}`) : main;
  const number = sub > 0 ? `${main}.${sub}` : String(main);
  const volume = Number(chapter.volume) || undefined;
  const name = decodeEntities(chapter.name ?? "").trim();
  const title = decimal || sub === 0 ? name : name ? `Parte ${sub} · ${name}` : `Parte ${sub}`;
  return {
    chapterId: String(chapter.id),
    title,
    label: name ? `Capitolo ${number}: ${name}` : `Capitolo ${number}`,
    chapNum,
    chapter: main,
    part: sub,
    volume,
    publishDate: parseDate(chapter.created),
  };
}

/** Old descriptions end with SEO keyword lists ("Capitoli X ITA, X scan ITA…"): drop them. */
function cleanSynopsis(text: string): string {
  return decodeEntities(text)
    .split(/\n\s*\n/u)
    .filter((paragraph) => !/\b(?:scan ita|sub ita|download|torrent)\b/iu.test(paragraph))
    .join("\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/gu, '"')
    .replace(/&#039;|&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function https(url: string): string {
  return url.replace(/^http:\/\//u, "https://");
}
