// Niadd serves the same backend as NineManga: the helpers below are adapted from
// the NineManga source in src/NineManga. Every language site (it/br/fr/ru.niadd.com)
// shares the markup, so parsing relies on structure and schema.org attributes rather
// than translated labels.
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

// de.niadd.com is left out: its images redirect to wie.mangadogs.com, which no longer
// resolves, so no chapter can be read there. en/es are left out because their chapter
// links go through ad redirectors (see AGENTS.md).
export const NIADD_LANGUAGES = {
  it: { baseUrl: "https://it.niadd.com", langCode: "it", label: "Italiano 🇮🇹" },
  br: { baseUrl: "https://br.niadd.com", langCode: "pt-br", label: "Português (BR) 🇧🇷" },
  fr: { baseUrl: "https://fr.niadd.com", langCode: "fr", label: "Français 🇫🇷" },
  ru: { baseUrl: "https://ru.niadd.com", langCode: "ru", label: "Русский 🇷🇺" },
} as const;

export type NiaddLanguage = keyof typeof NIADD_LANGUAGES;

export const DEFAULT_LANGUAGE: NiaddLanguage = "it";

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
  volume?: number;
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

const MINUTE_MS = 60_000;

/** "Il y a 2 heures", "45 минут назад", "3 giorni fa"…: unit words of every language site. */
const RELATIVE_UNITS: [RegExp, number][] = [
  [/min|минут/iu, MINUTE_MS],
  [/hour|heure|ora|ore|stunde|hora|час/iu, 60 * MINUTE_MS],
  [/day|jour|giorn|tag|dia|дн|день|дня/iu, 24 * 60 * MINUTE_MS],
];

/** Chapter keywords of the language sites, followed by the chapter number. */
const CHAPTER_KEYWORD =
  /(?:^|[\s:.,(])(?:ch(?:apter|apitre)?|cap(?:[ií]tulo|itolo)?|kapitel|episodi?o?|глава|гл)\.?\s*(\d+(?:\.\d+)?)/iu;
const VOLUME_KEYWORD = /(?:^|[\s:.,(])(?:vol(?:ume)?|tome|band|том)\.?\s*(\d+)/iu;

export function isNiaddLanguage(value: unknown): value is NiaddLanguage {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(NIADD_LANGUAGES, value);
}

/**
 * Library IDs carry their language so saved series keep working after the language
 * setting changes. Italian IDs stay unprefixed: they predate multi-language support.
 */
export function encodeMangaId(language: NiaddLanguage, slug: string): string {
  return language === "it" ? slug : `${language}:${slug}`;
}

export function decodeMangaId(mangaId: string): { language: NiaddLanguage; slug: string } {
  const separator = mangaId.indexOf(":");
  const prefix = separator > 0 ? mangaId.slice(0, separator) : "";
  if (isNiaddLanguage(prefix)) return { language: prefix, slug: mangaId.slice(separator + 1) };
  return { language: "it", slug: mangaId };
}

/** `/manga/One_Piece.html` → `One_Piece`. */
export function mangaIdFromHref(href: string | undefined): string {
  return decodeHtmlEntities(href ?? "").match(/\/manga\/([^/?#]+?)\.html/u)?.[1] ?? "";
}

/** `/chapter/Insomnia_21/989282/` or `/chapter/Episodi-21/989282.html` → `989282`. */
export function chapterIdFromHref(href: string | undefined): string {
  return decodeHtmlEntities(href ?? "").match(/\/chapter\/[^/]+\/(\d+)(?:[-/.]|$)/u)?.[1] ?? "";
}

/** The reader ignores the slug before the numeric chapter ID; the manga slug keeps URLs readable. */
export function readerUrl(
  baseUrl: string,
  mangaSlug: string,
  chapterId: string,
  page: number,
): string {
  return `${baseUrl}/chapter/${mangaSlug}/${chapterId}-10-${page}.html`;
}

export function parseMangaList(html: string, baseUrl: string, now = Date.now()): NiaddCard[] {
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
      imageUrl: normalizeUrl(unit.find(".manga-img img").first().attr("src") ?? "", baseUrl),
      latestChapterId: chapterIdFromHref(chapterLink.attr("href")) || undefined,
      latestChapterTitle: cleanText(chapterLink.text()) || undefined,
      updatedAt: parseDate(unit.find(".manga-latest-time").first().text(), now),
      intro: cleanText(unit.find(".manga-intro").first().text()) || undefined,
      genres: unit
        .find(".manga-cate-item-name")
        .toArray()
        .map((item) => cleanText($(item).text()))
        .filter(Boolean),
    });
  });

  return cards;
}

export function parseMangaDetails(
  html: string,
  baseUrl: string,
  language: NiaddLanguage,
): NiaddDetails {
  const $ = cheerio.load(html);
  const cells = $(".bookside-general-cell");
  const linkedNames = (selector: string): string =>
    dedupeStrings(
      cells
        .find(selector)
        .toArray()
        .map((link) => cleanText($(link).text())),
    ).join(", ");

  const genres: NiaddGenre[] = [];
  cells.find("[itemprop='genre']").each((_, element) => {
    const href = $(element).closest("a").attr("href") ?? "";
    const title = cleanText($(element).text());
    const id = decodeHtmlEntities(href).match(/\/category\/([^/?#]+?)\.html/u)?.[1] ?? title;
    if (id && title && !genres.some((genre) => genre.id === id)) genres.push({ id, title });
  });

  // The alternative titles row is the only one without links or schema.org fields.
  const alternativeCell = cells
    .filter((_, cell) => $(cell).find("a, [itemprop]").length === 0)
    .first();
  alternativeCell.find("span").first().remove();

  // The genres box reuses `.detail-synopsis`; the synopsis is the one without category links.
  const synopsis = $(".detail-section-box .detail-synopsis")
    .filter((_, box) => $(box).find("a[href*='/category/']").length === 0)
    .first();

  return {
    title:
      cleanText($(".book-headline-name").first().text()) ||
      cleanText($("meta[property='og:title']").attr("content")).replace(/\s+Details\b.*$/u, ""),
    secondaryTitles: cleanText(alternativeCell.text()).split(";").map(cleanText).filter(Boolean),
    imageUrl: normalizeUrl(
      $(".bookside-img img").first().attr("src") ??
        $("meta[property='og:image']").attr("content") ??
        "",
      baseUrl,
    ),
    synopsis: cleanText(synopsis.text()),
    author: linkedNames("a[href*='?author=']"),
    artist: linkedNames("a[href*='?artist=']"),
    genres,
    status: normalizeStatus($(".book-status").first().text(), language),
    released: cleanText(cells.find("[itemprop='datePublished']").first().text()).match(
      /\d{4}/u,
    )?.[0],
    mature: $(".chp-warn-box").length > 0,
  };
}

/** Parses `/manga/<slug>/chapters.html`, newest first like the site. */
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
      title: chapterDisplayTitle(title, mangaTitle),
      ...parseChapterNumbers(title, mangaTitle, link.attr("href") ?? ""),
      publishDate: parseDate(item.find(".chp-time, .detail-chp-time").first().text()),
    });
  });

  return chapters;
}

const CHAPTER_WORD: Partial<Record<NiaddLanguage, string>> = {
  it: "Capitolo",
  br: "Capítulo",
  fr: "Chapitre",
};

/** Lists label the latest chapter with a plural ("Episodi 21"): "Capitolo 21" reads right. */
export function latestChapterLabel(
  label: string | undefined,
  language: NiaddLanguage,
): string | undefined {
  const match = label?.match(/^(?:episodi|epis[óo]dios|chapitres)\s+(\d+(?:[.,]\d+)?)$/iu);
  const word = CHAPTER_WORD[language];
  return match && word ? `${word} ${match[1]}` : label;
}

/**
 * The site titles chapters "<series> <number>[: title]" ("Insomnia 21",
 * "BJ Alex (PT/BR) Cap 86", "… Том 2 Глава 200"). Paperback already shows the series
 * and the number, so keep only a real chapter title, if any.
 */
export function chapterDisplayTitle(title: string, mangaTitle: string): string {
  let rest = title;
  const series = mangaTitle.trim();
  if (series && rest.toLowerCase().startsWith(series.toLowerCase())) {
    rest = rest.slice(series.length);
  }
  // Optional volume ("Том 2", "v1 -"), optional chapter word, then the number(s).
  const marker =
    /^[\s:.\-–]*(?:(?:vol(?:ume)?|tome?|том|v)\.?\s*\d+\s*[-–]?\s*)?(?:(?:cap(?:itolo|[íi]tulo)?|ch(?:apter|apitre)?|chap|глава|episodi?o?)\.?\s*)?(?:v\.?\s*\d+\s*[-–]\s*)?\d+(?:[.,]\d+)?(?:\s*-\s*\d+)?(?=$|[\s:.\-–])[\s:.\-–]*/iu;
  return rest.replace(marker, "").trim();
}

/**
 * Reader pages hold 10 images each in `div.pic_box img.manga_pic`; other images on
 * the page preload the next page and are ignored. `select.sl-page` lists every
 * `-10-N` page of the chapter.
 */
export function parseReaderPage(html: string, baseUrl: string): NiaddReaderPage {
  const $ = cheerio.load(html);
  return {
    images: dedupeImages(
      $("div.pic_box img.manga_pic")
        .toArray()
        .map((element) => normalizeUrl(getImageUrl($, element), baseUrl)),
    ),
    pageUrls: dedupeStrings(
      $("select.sl-page option")
        .toArray()
        .map((element) => normalizeUrl($(element).attr("value") ?? "", baseUrl))
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

export function normalizeUrl(value: string, baseUrl: string): string {
  const trimmed = decodeHtmlEntities(value).trim();
  if (!trimmed || trimmed.startsWith("data:") || /def_logo|placeholder|blank/iu.test(trimmed))
    return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://")) return trimmed.replace(/^http:/u, "https:");
  if (trimmed.startsWith("https://")) return trimmed;
  return `${baseUrl}/${trimmed.replace(/^\/+/u, "")}`;
}

/** Absolute "Oct 24, 2026" / ISO dates, or relative ones counted back from `now`. */
export function parseDate(value: string, now = Date.now()): Date | undefined {
  const cleaned = cleanText(value);
  const match = cleaned.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/u);
  if (match) {
    const month = MONTHS[(match[1] ?? "").toLowerCase()];
    if (month !== undefined) return new Date(Number(match[3]), month, Number(match[2]));
  }
  const iso = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})/u);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const amount = Number(cleaned.match(/(\d+)/u)?.[1]);
  const unit = RELATIVE_UNITS.find(([pattern]) => pattern.test(cleaned))?.[1];
  if (unit && Number.isFinite(amount)) return new Date(now - amount * unit);
  return undefined;
}

/**
 * Chapter titles repeat the manga title and vary by site: "Cap 86", "Ch. 109",
 * "Kapitel 544", "Том 2 Глава 200", "2 - 161" (volume - chapter), "179.5".
 */
export function parseChapterNumbers(
  title: string,
  mangaTitle: string,
  href: string,
): { chapNum: number; volume?: number } {
  const prefix = cleanText(mangaTitle).toLowerCase();
  let rest = cleanText(title);
  if (prefix && rest.toLowerCase().startsWith(prefix)) rest = rest.slice(prefix.length);
  rest = rest.replace(/^[\s:.\-–]+/u, "");

  const volume = toNumber(rest.match(VOLUME_KEYWORD)?.[1]);
  const keyword = rest.match(CHAPTER_KEYWORD)?.[1];
  const pair = rest.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)/u);
  const chapter =
    toNumber(keyword) ??
    toNumber(pair?.[2]) ??
    toNumber(rest.replace(VOLUME_KEYWORD, " ").match(/(\d+(?:\.\d+)?)/u)?.[1]) ??
    toNumber(decodeHtmlEntities(href).match(/\/chapter\/[^/]*?_(\d+(?:\.\d+)?)\//u)?.[1]);

  return { chapNum: chapter ?? 0, volume: volume ?? toNumber(pair?.[1]) };
}

/** Italian labels on it.niadd.com (consistent with MangaWorld and fansub); other sites keep theirs. */
export function normalizeStatus(value: string, language: NiaddLanguage): string {
  const cleaned = cleanText(value).replace(/^\(|\)$/gu, "");
  if (!cleaned) return "";
  if (language !== "it") return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
