// Niadd serves the same backend as NineManga (it.niadd.com): the helpers below
// are adapted from the Italian NineManga source in src/NineManga.
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export const NIADD_BASE_URL = "https://it.niadd.com";

export interface NiaddCard {
  mangaId: string;
  title: string;
  imageUrl: string;
  latestChapterId?: string;
  latestChapterTitle?: string;
  updatedAt?: Date;
  intro?: string;
  genres: string[];
}

export interface NiaddGenre {
  id: string;
  title: string;
}

export interface NiaddDetails {
  title: string;
  secondaryTitles: string[];
  imageUrl: string;
  synopsis: string;
  author: string;
  artist: string;
  genres: NiaddGenre[];
  status: string;
  released?: string;
  mature: boolean;
}

export interface NiaddChapter {
  chapterId: string;
  title: string;
  chapNum: number;
  publishDate?: Date;
}

export interface NiaddReaderPage {
  images: string[];
  pageUrls: string[];
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** `/manga/One_Piece.html` → `One_Piece`. */
export function mangaIdFromHref(href: string | undefined): string {
  return decodeHtmlEntities(href ?? "").match(/\/manga\/([^/?#]+?)\.html/u)?.[1] ?? "";
}

/** `/chapter/Insomnia_21/989282/` or `/chapter/Episodi-21/989282.html` → `989282`. */
export function chapterIdFromHref(href: string | undefined): string {
  return decodeHtmlEntities(href ?? "").match(/\/chapter\/[^/]+\/(\d+)(?:[-/.]|$)/u)?.[1] ?? "";
}

/** The reader ignores the slug before the numeric chapter ID; the manga ID keeps URLs readable. */
export function readerUrl(mangaId: string, chapterId: string, page: number): string {
  return `${NIADD_BASE_URL}/chapter/${mangaId}/${chapterId}-10-${page}.html`;
}

export function parseMangaList(html: string): NiaddCard[] {
  const $ = cheerio.load(html);
  const cards: NiaddCard[] = [];
  const seen = new Set<string>();

  $("table.manga-content").each((_, element) => {
    const unit = $(element);
    const titleLink = unit.find(".manga-part-inner-info a[href*='/manga/']").first();
    const mangaId = mangaIdFromHref(
      titleLink.attr("href") ?? unit.find("a[href*='/manga/']").attr("href"),
    );
    const title =
      cleanText(unit.find(".manga-name").first().text()) || cleanText(titleLink.attr("title"));
    if (!mangaId || !title || seen.has(mangaId)) return;
    seen.add(mangaId);

    const chapterLink = unit
      .find(".manga-latest-chp a[href*='/chapter/'], a[href*='/chapter/']")
      .first();
    cards.push({
      mangaId,
      title,
      imageUrl: normalizeUrl(unit.find(".manga-img img").first().attr("src") ?? ""),
      latestChapterId: chapterIdFromHref(chapterLink.attr("href")) || undefined,
      latestChapterTitle: cleanText(chapterLink.text()) || undefined,
      updatedAt: parseDate(unit.find(".manga-latest-time").first().text()),
      intro: cleanText(unit.find(".manga-intro").first().text()) || undefined,
      genres: unit
        .find(".manga-cate-item-name")
        .toArray()
        .map((element) => cleanText($(element).text()))
        .filter(Boolean),
    });
  });

  return cards;
}

export function parseMangaDetails(html: string): NiaddDetails {
  const $ = cheerio.load(html);
  const info = new Map<string, string>();
  $(".bookside-general-cell").each((_, element) => {
    const text = cleanText($(element).text());
    const separator = text.indexOf(":");
    if (separator > 0) {
      info.set(text.slice(0, separator).toLowerCase(), cleanText(text.slice(separator + 1)));
    }
  });
  const field = (prefix: string): string =>
    [...info.entries()].find(([key]) => key.startsWith(prefix))?.[1] ?? "";

  const genres: NiaddGenre[] = [];
  // Only the "generi" row: the release year row also links to /category/<year>.html.
  const genreCell = $(".bookside-general-cell")
    .filter((_, cell) => /^\s*generi\b/iu.test($(cell).text()))
    .first();
  genreCell.find("a[href*='/category/']").each((_, element) => {
    const id = decodeHtmlEntities($(element).attr("href") ?? "").match(
      /\/category\/([^/?#]+?)\.html/u,
    )?.[1];
    const title = cleanText($(element).text()).replace(/^[,\s]+|[,\s]+$/gu, "");
    if (id && title && !genres.some((genre) => genre.id === id)) genres.push({ id, title });
  });
  if (genres.length === 0) {
    for (const title of field("generi").split(",").map(cleanText).filter(Boolean)) {
      genres.push({ id: title.toLowerCase().replace(/[^a-z0-9]+/gu, "-"), title });
    }
  }

  return {
    title:
      cleanText($(".book-headline-name").first().text()) ||
      cleanText($("meta[property='og:title']").attr("content")).replace(/\s+Details\b.*$/u, ""),
    secondaryTitles: field("alternative").split(";").map(cleanText).filter(Boolean),
    imageUrl: normalizeUrl(
      $(".bookside-img img").first().attr("src") ??
        $("meta[property='og:image']").attr("content") ??
        "",
    ),
    // The genres box reuses `.detail-synopsis`: pick the box titled "Sinossi".
    synopsis: cleanText(
      $(".detail-section-box")
        .filter((_, box) => /sinossi/iu.test($(box).find(".detail-cate-title").first().text()))
        .first()
        .find(".detail-synopsis")
        .text(),
    ),
    author: field("autore"),
    artist: field("artista"),
    genres,
    status: normalizeStatus($(".book-status").first().text()),
    released: field("rilasciato").match(/\d{4}/u)?.[0],
    mature: $(".chp-warn-box").length > 0,
  };
}

/** Parses `/manga/<id>/chapters.html`, newest first like the site. */
export function parseChapters(html: string, mangaTitle: string): NiaddChapter[] {
  const $ = cheerio.load(html);
  const chapters: NiaddChapter[] = [];
  const seen = new Set<string>();

  $("a[href*='/chapter/']").each((_, element) => {
    const link = $(element);
    const item = link.find(".chp-item, .detail-chp-item").first();
    if (item.length === 0) return;
    const chapterId = chapterIdFromHref(link.attr("href"));
    if (!chapterId || seen.has(chapterId)) return;
    seen.add(chapterId);

    const title =
      cleanText(item.find(".chp-title, .detail-chp-name").first().text()) ||
      cleanText(link.attr("title"));
    chapters.push({
      chapterId,
      title,
      chapNum: extractChapterNumber(title, mangaTitle, link.attr("href") ?? ""),
      publishDate: parseDate(item.find(".chp-time, .detail-chp-time").first().text()),
    });
  });

  return chapters;
}

/**
 * Reader pages hold 10 images each in `div.pic_box img.manga_pic`; other images on
 * the page preload the next page and are ignored. `select.sl-page` lists every
 * `-10-N` page of the chapter.
 */
export function parseReaderPage(html: string): NiaddReaderPage {
  const $ = cheerio.load(html);
  return {
    images: dedupeImages(
      $("div.pic_box img.manga_pic")
        .toArray()
        .map((element) => normalizeUrl(getImageUrl($, element))),
    ),
    pageUrls: dedupeStrings(
      $("select.sl-page option")
        .toArray()
        .map((element) => normalizeUrl($(element).attr("value") ?? ""))
        .filter((url) => /\/chapter\/[^/]+\/\d+-\d+-\d+\.html$/u.test(url)),
    ),
  };
}

/** Signed CDN URLs differ only in their query string between preloads; compare by path. */
export function dedupeImages(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const key = url.split("?")[0] ?? url;
    if (!url || seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

export function isChallengePage(html: string): boolean {
  return /<title>\s*(?:Just a moment|Attention Required)/iu.test(html) || html.includes("cf-chl-");
}

function getImageUrl($: CheerioAPI, element: Parameters<CheerioAPI>[0]): string {
  const image = $(element);
  return image.attr("data-original") || image.attr("data-src") || image.attr("src") || "";
}

export function normalizeUrl(value: string): string {
  const trimmed = decodeHtmlEntities(value).trim();
  if (!trimmed || trimmed.startsWith("data:") || /def_logo|placeholder|blank/iu.test(trimmed))
    return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://")) return trimmed.replace(/^http:/u, "https:");
  if (trimmed.startsWith("https://")) return trimmed;
  return `${NIADD_BASE_URL}/${trimmed.replace(/^\/+/u, "")}`;
}

export function parseDate(value: string): Date | undefined {
  const cleaned = cleanText(value);
  const match = cleaned.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/u);
  if (match) {
    const month = MONTHS[(match[1] ?? "").toLowerCase()];
    if (month !== undefined) return new Date(Number(match[3]), month, Number(match[2]));
  }
  const iso = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})/u);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return undefined;
}

/** Chapter titles repeat the manga title ("One Piece 1141"); the number follows it. */
export function extractChapterNumber(title: string, mangaTitle: string, href: string): number {
  const prefix = cleanText(mangaTitle).toLowerCase();
  let rest = cleanText(title);
  if (prefix && rest.toLowerCase().startsWith(prefix)) rest = rest.slice(prefix.length);
  const fromTitle = rest.match(/(\d+(?:\.\d+)?)/u)?.[1];
  const fromSlug = decodeHtmlEntities(href).match(/\/chapter\/[^/]*?_(\d+(?:\.\d+)?)\//u)?.[1];
  const parsed = Number.parseFloat(fromTitle ?? fromSlug ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Italian labels, consistent with MangaWorld and the fansub sources. */
export function normalizeStatus(value: string): string {
  const cleaned = cleanText(value).replace(/^\(|\)$/gu, "");
  if (!cleaned) return "";
  if (/complet|termin|finito|conclus/iu.test(cleaned)) return "Completato";
  if (/in corso|ongoing|serializz/iu.test(cleaned)) return "In corso";
  if (/pausa|sospes|hiatus/iu.test(cleaned)) return "In pausa";
  return cleaned;
}

export function cleanText(value: string | undefined): string {
  return decodeHtmlEntities(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&#038;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#0?39;/gu, "'")
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
