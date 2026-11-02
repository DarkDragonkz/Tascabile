// The readers' API is validated from `unknown`: an HTML page (error, maintenance or
// anti-bot page) or a changed payload becomes a readable error instead of a TypeError,
// while a well-formed empty list (`{"comics":[]}`) stays a valid empty result.
// Messages name what was expected, never the response body.
import type { ComicDetail, ComicDetailChapter, ComicListItem, Genre, Team } from "./models";

export class FansubResponseError extends Error {
  override name = "FansubResponseError";
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseBody(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const kind = /^\s*</u.test(raw)
      ? "una pagina HTML"
      : raw.trim()
        ? "un testo non JSON"
        : "una risposta vuota";
    throw new FansubResponseError(`${what}: il reader ha restituito ${kind} invece dei dati.`);
  }
}

function invalid(what: string, field: string): FansubResponseError {
  return new FansubResponseError(`${what}: risposta del reader senza il campo «${field}» atteso.`);
}

/** API flags are 0/1; booleans are accepted too. */
function adultFlag(value: unknown): number {
  return value === 1 || value === true || value === "1" ? 1 : 0;
}

/** A chapter is usable only with the URL that identifies it (its chapter ID). */
function toChapter(value: unknown): ComicDetailChapter | undefined {
  if (!isObject(value)) return undefined;
  const url = text(value.url);
  if (!url) return undefined;
  return {
    id: nullableNumber(value.id),
    full_title: text(value.full_title) ?? "",
    title: nullableText(value.title),
    volume: nullableNumber(value.volume),
    chapter: nullableNumber(value.chapter),
    subchapter: nullableNumber(value.subchapter),
    language: text(value.language) ?? "",
    teams: Array.isArray(value.teams)
      ? value.teams.map((team): Team | null =>
          isObject(team) && typeof team.name === "string"
            ? { name: team.name, url: text(team.url) ?? "" }
            : null,
        )
      : [],
    published_on: text(value.published_on) ?? "",
    url,
  };
}

/** A series is usable only with its slug (the manga ID) and a title. */
function toListItem(value: unknown): ComicListItem | undefined {
  if (!isObject(value)) return undefined;
  const slug = text(value.slug);
  const title = text(value.title);
  if (!slug || title === undefined) return undefined;
  return {
    title,
    slug,
    thumbnail: text(value.thumbnail) ?? "",
    thumbnail_small: text(value.thumbnail_small),
    adult: adultFlag(value.adult),
    author: nullableText(value.author),
    alt_titles: strings(value.alt_titles),
    last_chapter: toChapter(value.last_chapter) ?? null,
  };
}

/** `/comics` and `/search/<title>`: series with an unusable slug are skipped, not fatal. */
export function parseComicList(raw: string, what = "Catalogo"): ComicListItem[] {
  const body = parseBody(raw, what);
  if (!isObject(body) || !Array.isArray(body.comics)) throw invalid(what, "comics");
  return body.comics.flatMap((item) => toListItem(item) ?? []);
}

/** `/comics/<slug>`: the series with its chapters, newest first like the API. */
export function parseComicDetail(raw: string): ComicDetail {
  const what = "Scheda della serie";
  const body = parseBody(raw, what);
  if (!isObject(body) || !isObject(body.comic)) throw invalid(what, "comic");
  const comic = body.comic;
  const title = text(comic.title);
  if (title === undefined) throw invalid(what, "comic.title");
  if (!Array.isArray(comic.chapters)) throw invalid(what, "comic.chapters");
  return {
    title,
    slug: text(comic.slug) ?? "",
    url: text(comic.url) ?? "",
    thumbnail: text(comic.thumbnail) ?? "",
    thumbnail_small: text(comic.thumbnail_small) ?? "",
    description: nullableText(comic.description),
    alt_titles: strings(comic.alt_titles),
    author: nullableText(comic.author),
    artist: nullableText(comic.artist),
    genres: Array.isArray(comic.genres)
      ? comic.genres.flatMap((genre): Genre[] =>
          isObject(genre) && typeof genre.slug === "string" && typeof genre.name === "string"
            ? [{ slug: genre.slug, name: genre.name }]
            : [],
        )
      : [],
    status: nullableText(comic.status),
    adult: adultFlag(comic.adult),
    created_at: text(comic.created_at) ?? "",
    updated_at: text(comic.updated_at) ?? "",
    rating: nullableNumber(comic.rating),
    target: nullableText(comic.target),
    views: nullableNumber(comic.views),
    chapters: comic.chapters.flatMap((chapter) => toChapter(chapter) ?? []),
  };
}

/** `/read/…`: page URLs in reading order; an empty list is valid (the caller decides). */
export function parseChapterPages(raw: string): string[] {
  const what = "Pagine del capitolo";
  const body = parseBody(raw, what);
  if (!isObject(body) || !isObject(body.chapter)) throw invalid(what, "chapter");
  if (!Array.isArray(body.chapter.pages)) throw invalid(what, "chapter.pages");
  return strings(body.chapter.pages);
}
