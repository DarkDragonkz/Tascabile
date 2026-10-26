// Parsers for WordPress sites running the Madara manga theme (Shinobi Scans,
// AnimeShinigami). They rely on the theme's stable class names rather than on labels,
// and stay free of Paperback runtime calls so they can be tested offline.
import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

export interface MadaraCard {
  mangaId: string;
  title: string;
  imageUrl: string;
  type?: string;
  latestChapterId?: string;
  latestChapterTitle?: string;
  updatedAt?: Date;
}

export interface MadaraDetails {
  title: string;
  secondaryTitles: string[];
  imageUrl: string;
  synopsis: string;
  authors: string[];
  artists: string[];
  genres: { id: string; title: string }[];
  status?: string;
  released?: string;
  type?: string;
  adult: boolean;
}

export interface MadaraChapter {
  chapterId: string;
  title: string;
  chapNum: number;
  volume?: number;
  publishDate?: Date;
}

export interface MadaraOption {
  id: string;
  title: string;
}

const MONTHS: Record<string, number> = {
  gennaio: 0,
  febbraio: 1,
  marzo: 2,
  aprile: 3,
  maggio: 4,
  giugno: 5,
  luglio: 6,
  agosto: 7,
  settembre: 8,
  ottobre: 9,
  novembre: 10,
  dicembre: 11,
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const STATUS: Record<string, string> = {
  ongoing: "In corso",
  "on-going": "In corso",
  "in corso": "In corso",
  completed: "Completato",
  completo: "Completato",
  completato: "Completato",
  end: "Completato",
  canceled: "Cancellato",
  cancelled: "Cancellato",
  "on hold": "In pausa",
  "on-hold": "In pausa",
  upcoming: "In arrivo",
};

/** Theme status values offered by the advanced search, with Italian labels. */
export const STATUS_OPTIONS: MadaraOption[] = [
  { id: "on-going", title: "In corso" },
  { id: "end", title: "Completato" },
  { id: "on-hold", title: "In pausa" },
  { id: "canceled", title: "Cancellato" },
];

/** `/manga/<slug>/` → `<slug>`; undefined for links outside the manga directory. */
export function mangaIdFromUrl(url: string | undefined): string | undefined {
  return url?.match(/\/manga\/([^/?#]+)/u)?.[1];
}

/** `/manga/<slug>/volume-1/21/` → `volume-1/21`: the chapter path inside the series. */
export function chapterIdFromUrl(url: string | undefined): string | undefined {
  const path = url?.match(/\/manga\/[^/?#]+\/([^?#]+?)\/?(?:[?#]|$)/u)?.[1];
  return path || undefined;
}

/** Catalogue pages (`.page-item-detail`) and search results (`.c-tabs-item__content`). */
export function parseMangaList(html: string, now = Date.now()): MadaraCard[] {
  const $ = cheerio.load(html);
  const cards = new Map<string, MadaraCard>();
  $(".page-item-detail, .c-tabs-item__content").each((_, element) => {
    const item = $(element);
    const link = item.find(".post-title a").first();
    const mangaId = mangaIdFromUrl(link.attr("href"));
    if (!mangaId || cards.has(mangaId)) return;

    const chapter = item.find(".chapter-item, .latest-chap").first();
    const chapterLink = chapter.find(".chapter a").first();
    // Series without chapters show a placeholder link to `…/n-a/` titled "0".
    const latestChapterId = chapterIdFromUrl(chapterLink.attr("href"));
    const hasChapter = latestChapterId !== undefined && latestChapterId !== "n-a";
    // "NEW"/"HOT" are promotional badges, not the series type.
    const type = cleanText(item.find(".manga-title-badges").first().text());
    cards.set(mangaId, {
      mangaId,
      title: cleanText(link.text()),
      imageUrl: imageOf(item.find("img").first()),
      type: /^(new|hot)$/iu.test(type) ? undefined : type || undefined,
      latestChapterId: hasChapter ? latestChapterId : undefined,
      latestChapterTitle: hasChapter ? chapterLabel(cleanText(chapterLink.text())) : undefined,
      updatedAt: parseDate(dateText($, chapter.find(".post-on").first()), now),
    });
  });
  return [...cards.values()];
}

/** Whether the theme's pagination links to the following page. */
export function hasNextPage(html: string, page: number): boolean {
  return html.includes(`/page/${page + 1}/`);
}

export function parseMangaDetails(html: string): MadaraDetails {
  const $ = cheerio.load(html);
  const rows = new Map<string, Cheerio<AnyNode>>();
  $(".post-content_item").each((_, element) => {
    const heading = cleanText($(element).find(".summary-heading").text())
      .toLowerCase()
      .replace(/\(s\)$/u, "");
    rows.set(heading, $(element).find(".summary-content").first());
  });
  const row = (...names: string[]) => names.map((name) => rows.get(name)).find(Boolean);
  const links = (node: Cheerio<AnyNode> | undefined) =>
    node
      ? node
          .find("a")
          .map((_, a) => cleanText($(a).text()))
          .get()
          .filter(Boolean)
      : [];

  const genres = $(".genres-content a")
    .map((_, a) => ({
      id:
        $(a)
          .attr("href")
          ?.match(/\/manga-genre\/([^/?#]+)/u)?.[1] ?? "",
      title: cleanText($(a).text()),
    }))
    .get()
    .filter((genre) => genre.id && genre.title);
  const badge = $(".post-title .manga-title-badges");
  // Some child themes move the <h1> out of `.post-title`.
  const title = cleanText(
    $(".post-title h1, .post-title h3, .profile-manga h1, h1").first().text(),
  );
  const alternative = cleanText(row("alternative", "titolo alternativo")?.text() ?? "");
  const statusText = cleanText(row("status", "stato")?.text() ?? "").toLowerCase();

  return {
    title,
    secondaryTitles: alternative
      .split(/[,;/]/u)
      .map((name) => name.trim())
      .filter((name) => name && name !== title),
    imageUrl: originalImage(imageOf($(".summary_image img").first())),
    synopsis: synopsisOf($),
    authors: links(row("author", "autore", "authors")),
    artists: links(row("artist", "artista", "artists")),
    genres,
    status: STATUS[statusText] ?? (statusText ? capitalize(statusText) : undefined),
    released: cleanText(row("release", "anno", "rilascio")?.text() ?? "") || undefined,
    type: cleanText(row("type", "tipo")?.text() ?? "") || cleanText(badge.text()) || undefined,
    adult: badge.hasClass("adult") || genres.some((genre) => /^(adult|adulti|18)/iu.test(genre.id)),
  };
}

/** Chapters as listed by the theme (newest first), including those grouped in volumes. */
export function parseChapters(html: string, now = Date.now()): MadaraChapter[] {
  const $ = cheerio.load(html);
  const chapters = new Map<string, MadaraChapter>();
  $("li.wp-manga-chapter").each((_, element) => {
    const item = $(element);
    const link = item.find("a").first();
    const chapterId = chapterIdFromUrl(link.attr("href"));
    if (!chapterId || chapters.has(chapterId)) return;
    const title = cleanText(link.text());
    const volumeHeading = item.closest("li.parent").children("a").first().text();
    chapters.set(chapterId, {
      chapterId,
      title,
      chapNum: chapterNumber(title, chapterId),
      volume: volumeNumber(volumeHeading, chapterId),
      publishDate: parseDate(dateText($, item.find(".chapter-release-date").first()), now),
    });
  });
  return [...chapters.values()];
}

/** Reader images in page order, trimmed (the theme pads `src` with whitespace) and HTTPS. */
export function parseChapterImages(html: string): string[] {
  const $ = cheerio.load(html);
  const images = $(".reading-content img")
    .map((_, img) => imageOf($(img), false))
    .get()
    .filter(Boolean);
  return [...new Set(images)];
}

/** Genre checkboxes of the theme's advanced search form, with their visible labels. */
export function parseGenreOptions(html: string): MadaraOption[] {
  const $ = cheerio.load(html);
  const options = new Map<string, string>();
  $('input[name="genre[]"]').each((_, input) => {
    const id = $(input).attr("value")?.trim();
    if (!id || options.has(id)) return;
    const inputId = $(input).attr("id");
    const label = inputId ? $(`label[for="${inputId}"]`).first().text() : "";
    options.set(id, cleanText(label).replace(/\s*\(\d+\)$/u, "") || capitalize(id));
  });
  return [...options].map(([id, title]) => ({ id, title }));
}

/** True when the page is a theme 404 or not a manga page at all. */
export function isMissingPage(html: string): boolean {
  return !/class="[^"]*(?:post-title|reading-content)/u.test(html);
}

/**
 * Release dates seen on Madara sites: "2 Ottobre 2026", "Ottobre 1, 2026",
 * "2023-07-20 20:32:45" and relative ones ("3 ore ago", "2 giorni fa", "1 day ago").
 */
export function parseDate(text: string | undefined, now = Date.now()): Date | undefined {
  const value = text?.trim().toLowerCase();
  if (!value) return undefined;

  const relative = value.match(
    /(\d+)\s*(second|sec|minut|min|or[ae]|hour|giorn|day|settiman|week|mes[ei]|month|ann[oi]|year)/u,
  );
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2] ?? "";
    const minutes = /^(second|sec)/u.test(unit)
      ? 0
      : /^(minut|min)/u.test(unit)
        ? 1
        : /^(or|hour)/u.test(unit)
          ? 60
          : /^(giorn|day)/u.test(unit)
            ? 1_440
            : /^(settiman|week)/u.test(unit)
              ? 10_080
              : /^(mes|month)/u.test(unit)
                ? 43_200
                : 525_600;
    return new Date(now - amount * minutes * 60_000);
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{2}):(\d{2})(?::(\d{2}))?)?/u);
  if (iso) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = iso;
    return validDate(new Date(+y!, +m! - 1, +d!, +hh, +mm, +ss));
  }

  const dayFirst = value.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/u);
  if (dayFirst && MONTHS[dayFirst[2]!] !== undefined) {
    return validDate(new Date(+dayFirst[3]!, MONTHS[dayFirst[2]!]!, +dayFirst[1]!));
  }
  const monthFirst = value.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/u);
  if (monthFirst && MONTHS[monthFirst[1]!] !== undefined) {
    return validDate(new Date(+monthFirst[3]!, MONTHS[monthFirst[1]!]!, +monthFirst[2]!));
  }
  const numeric = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/u);
  if (numeric) return validDate(new Date(+numeric[3]!, +numeric[2]! - 1, +numeric[1]!));
  return undefined;
}

/** Bare numbers ("21") read as "Capitolo 21"; other titles stay as the team wrote them. */
function chapterLabel(title: string): string | undefined {
  if (!title) return undefined;
  return /^\d+(?:[.,]\d+)?$/u.test(title) ? `Capitolo ${title}` : title;
}

/**
 * WordPress keeps the uploaded original next to its resized copies
 * (`cover-193x278.jpg` → `cover.jpg`); the details page deserves the full cover.
 */
function originalImage(url: string): string {
  return url.replace(/-\d+x\d+(\.(?:jpe?g|png|webp|gif))$/iu, "$1");
}

/** First number of the title ("Capitolo 12.5", "21 - Ossone (2)"), else of the URL. */
function chapterNumber(title: string, chapterId: string): number {
  const fromTitle = title.match(/(?:cap(?:itolo)?|ch(?:apter)?\.?|^)\s*(\d+(?:[.,]\d+)?)/iu)?.[1];
  const fromUrl = chapterId
    .split("/")
    .pop()
    ?.match(/(\d+(?:[-.]\d+)?)/u)?.[1];
  const value = Number((fromTitle ?? fromUrl ?? "").replace(/[,-]/u, "."));
  return Number.isFinite(value) && (fromTitle ?? fromUrl) ? value : 0;
}

function volumeNumber(heading: string, chapterId: string): number | undefined {
  const source = heading || chapterId;
  const value = Number(source.match(/vol(?:ume)?[\s.-]*(\d+)/iu)?.[1]);
  return value > 0 ? value : undefined;
}

/** Visible date, or the "3 ore ago" title the theme puts on the "new" badge. */
function dateText($: CheerioAPI, node: Cheerio<AnyNode>): string | undefined {
  return cleanText(node.text()) || node.find("a[title]").attr("title") || undefined;
}

function synopsisOf($: CheerioAPI): string {
  const text = $(".summary__content, .description-summary .summary__content")
    .first()
    .find("p")
    .map((_, p) => cleanText($(p).text()))
    .get()
    .filter(Boolean)
    .join("\n\n");
  return (
    text ||
    cleanText($(".summary__content, .description-summary").first().text()) ||
    cleanText($('meta[property="og:description"], meta[name="description"]').attr("content") ?? "")
  );
}

/** Largest `srcset` candidate (the cover, not a 110×150 thumbnail), else lazy or plain src. */
function imageOf(img: Cheerio<AnyNode>, preferSrcset = true): string {
  const srcset = preferSrcset ? (img.attr("data-srcset") ?? img.attr("srcset")) : undefined;
  const best = srcset
    ?.split(",")
    .map((entry) => entry.trim().split(/\s+/u))
    .map(([url, width]) => ({ url: url ?? "", width: parseInt(width ?? "0", 10) || 0 }))
    .filter((entry) => entry.url)
    .sort((a, b) => b.width - a.width)[0]?.url;
  const url = best ?? img.attr("data-src") ?? img.attr("data-lazy-src") ?? img.attr("src") ?? "";
  return url
    .trim()
    .replace(/^\/\//u, "https://")
    .replace(/^http:\/\//u, "https://");
}

function validDate(date: Date): Date | undefined {
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function cleanText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
