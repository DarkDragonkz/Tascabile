/* SPDX-License-Identifier: MIT */

import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type JSONValue,
  type MangaProviding,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";
import * as cheerio from "cheerio";

const BASE_URL = "https://onisaga.com";

function absoluteUrl(value: string): string {
  if (!value) return "";
  if (/^https?:\/\//u.test(value)) return value;
  return new globalThis.URL(value, BASE_URL).toString();
}

function normalizeImage(value: string): string {
  if (!value || value.startsWith("data:")) return "";
  return absoluteUrl(value);
}

function parseCards(html: string): SearchResultItem[] {
  const $ = cheerio.load(html);
  const items: SearchResultItem[] = [];
  const seen = new Set<string>();

  $('a[href*="/manga/"]').each((_, element) => {
    const link = $(element);
    const href = absoluteUrl(link.attr("href") ?? "");
    if (!href) return;

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      return;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() !== "manga" || !segments[1]) return;
    const mangaId = segments[1];
    if (seen.has(mangaId)) return;

    const container = link.closest("div.relative.group").length
      ? link.closest("div.relative.group")
      : link.parent();
    const image = container.find("img").first();
    const title =
      container.find("[data-flux-heading], h3, h4").first().text().trim() ||
      link.attr("title")?.trim() ||
      image.attr("alt")?.trim() ||
      link.text().trim();
    if (!title) return;

    const imageUrl = normalizeImage(
      image.attr("data-src") ?? image.attr("data-lazy-src") ?? image.attr("src") ?? "",
    );

    const isAdult = /\b18\+\b/u.test(container.text());
    seen.add(mangaId);
    items.push({
      mangaId,
      title,
      imageUrl,
      contentRating: isAdult ? ContentRating.ADULT : ContentRating.EVERYONE,
    });
  });

  return items;
}

function parseRelativeDate(value: string): Date {
  const normalized = value.trim().toLowerCase();
  const now = Date.now();
  if (normalized.includes("today")) return new Date(now);
  if (normalized.includes("yesterday")) return new Date(now - 86_400_000);
  const match = normalized.match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/u);
  if (!match) return new Date(0);
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };
  return new Date(now - amount * (multipliers[unit] ?? 0));
}

class OniSagaExtension
  implements
    Extension,
    MangaProviding,
    ChapterProviding,
    SearchResultsProviding,
    DiscoverSectionProviding
{
  readonly rateLimiter = new BasicRateLimiter("onisaga-main", {
    numberOfRequests: 4,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async initialise(): Promise<void> {
    this.rateLimiter.registerInterceptor();
  }

  private async fetchText(url: string, headers?: Record<string, string>): Promise<string> {
    const [, data] = await Application.scheduleRequest({
      url,
      method: "GET",
      headers: {
        "user-agent": await Application.getDefaultUserAgent(),
        ...headers,
      },
    });
    return Application.arrayBufferToUTF8String(data);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "browse",
        title: "Browse",
        type: DiscoverSectionType.featured,
      },
    ];
  }

  async getDiscoverSectionItems(
    _section: DiscoverSection,
    _metadata: undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const items = parseCards(await this.fetchText(`${BASE_URL}/browse`)).map(
      (item): DiscoverSectionItem => ({
        type: "featuredCarouselItem",
        mangaId: item.mangaId,
        title: item.title,
        imageUrl: item.imageUrl,
        contentRating: item.contentRating,
      }),
    );
    return { items };
  }

  async getSearchResults(
    query: SearchQuery<JSONValue>,
    _metadata: JSONValue | undefined,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const title = query.title.toString().trim();
    const url = title.length > 0 ? `${BASE_URL}/search/${encodeURIComponent(title)}` : `${BASE_URL}/browse`;
    return { items: parseCards(await this.fetchText(url)) };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = `${BASE_URL}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.fetchText(url);
    const $ = cheerio.load(html);

    const title = $("h1, [data-flux-heading]").first().text().trim() || mangaId;
    const cover = $(".w-32 picture img, .w-32 img").first();
    const thumbnailUrl = normalizeImage(
      cover.attr("data-src") ?? cover.attr("data-lazy-src") ?? cover.attr("src") ?? "",
    );
    const description = $("p.leading-relaxed").first().text().trim();
    const author = $('a[href*="/author/"]').map((_, el) => $(el).text().trim()).get().filter(Boolean).join(", ");
    const genres = $('a[href*="/genre/"]')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    const statusText = $("span.inline-flex, span:has(> span.size-1\\.5)")
      .map((_, el) => $(el).text().trim())
      .get()
      .find((value) => /ongoing|releasing|completed|hiatus|cancelled|dropped/iu.test(value));
    const isAdult = /\b18\+\b/u.test($.root().text());

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl,
        synopsis: description,
        author,
        artist: "",
        status: statusText ?? "Unknown",
        contentRating: isAdult ? ContentRating.ADULT : ContentRating.EVERYONE,
        tagGroups: [
          {
            id: "genres",
            title: "Genres",
            tags: genres.map((genre) => ({ id: genre.toLowerCase().replace(/\s+/gu, "-"), title: genre })),
          },
        ],
        shareUrl: url,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const html = await this.fetchText(`${BASE_URL}/manga/${encodeURIComponent(sourceManga.mangaId)}`);
    const $ = cheerio.load(html);
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    $('a[href*="/read/"]').each((_, element) => {
      const link = $(element);
      const href = absoluteUrl(link.attr("href") ?? "");
      if (!href) return;
      const parsed = new URL(href);
      const chapterId = parsed.pathname;
      if (seen.has(chapterId)) return;

      const container = link.closest("a, li, div");
      const heading = container.find("[data-flux-heading]").first().text().trim();
      const rawText = heading || link.text().trim();
      const numberMatch = rawText.match(/(?:chapter\s*)?([\d.]+)/iu);
      const chapNum = Number(numberMatch?.[1] ?? 0);
      const detailsText = container.find("p[data-flux-text]").first().text();
      const dateCandidate = detailsText
        .replace(/\s+-\s+/gu, " · ")
        .split(/\s*·\s*/u)
        .find((part) => /ago|today|yesterday/iu.test(part));

      seen.add(chapterId);
      chapters.push({
        chapterId,
        sourceManga,
        langCode: "en",
        chapNum,
        title: rawText || `Chapter ${chapNum}`,
        publishDate: parseRelativeDate(dateCandidate ?? ""),
      });
    });

    return chapters.sort((a, b) => b.chapNum - a.chapNum);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const chapterUrl = absoluteUrl(chapter.chapterId);
    const html = await this.fetchText(chapterUrl);
    const tokenMatch = html.match(/readerToken["']?\s*:\s*["']([^"']+)["']/u);
    let token = tokenMatch?.[1] ?? "";
    if (!token) throw new Error("OniSaga reader token not found");

    const pageMatches = [...html.matchAll(/["']?order["']?\s*:\s*(\d+)/gu)];
    const pageCount = pageMatches.length;
    if (pageCount === 0) throw new Error("OniSaga page list not found");

    const chapterId = new URL(chapterUrl).pathname.split("/").filter(Boolean).at(-1);
    if (!chapterId) throw new Error("OniSaga chapter id not found");

    const pages: string[] = [];
    for (let index = 0; index < pageCount; index += 1) {
      const [response, data] = await Application.scheduleRequest({
        url: `${BASE_URL}/api/chapter/${encodeURIComponent(chapterId)}/page/${index}`,
        method: "GET",
        headers: {
          "X-Reader-Token": token,
          Referer: chapterUrl,
          "user-agent": await Application.getDefaultUserAgent(),
        },
      });

      const nextToken = response.headers?.["x-reader-token-next"];
      if (nextToken) token = nextToken;

      const payload = JSON.parse(Application.arrayBufferToUTF8String(data)) as {
        url?: string;
        message?: string;
      };
      if (!payload.url) {
        throw new Error(payload.message ?? `OniSaga page ${index + 1} failed`);
      }
      pages.push(payload.url);
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }
}

export const OniSaga = new OniSagaExtension();
