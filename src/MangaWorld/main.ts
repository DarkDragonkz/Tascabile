import { BasicRateLimiter, DiscoverSectionType, type Chapter, type ChapterDetails, type ChapterProviding, type DiscoverSection, type DiscoverSectionItem, type DiscoverSectionProviding, type Extension, type MangaProviding, type PagedResults, type SearchQuery, type SearchResultItem, type SearchResultsProviding, type SourceManga } from "@paperback/types";
import * as cheerio from "cheerio";

import { fetchText } from "../common/network";
import { buildUrl } from "../../lib/core/url";
import { MANGA_WORLD_DOMAIN, MANGA_WORLD_PLACEHOLDER_IMAGE } from "../../lib/sources/MangaWorld/constants";
import { MangaWorldParser, type MangaWorldChapter, type MangaWorldMangaDetails, type MangaWorldSourceManga } from "../../lib/sources/MangaWorld/MangaWorldParser";
import pbconfig from "./pbconfig";

const SECTION_IDS = {
  TRENDING: "trending",
  NEWEST: "newest",
} as const;

export class MangaWorldExtension implements Extension, SearchResultsProviding, MangaProviding, ChapterProviding, DiscoverSectionProviding {
  globalRateLimiter = new BasicRateLimiter("mangaworld", {
    numberOfRequests: 2,
    bufferInterval: 1,
    ignoreImages: true,
  });

  private readonly parser = new MangaWorldParser();

  async initialise(): Promise<void> {
    this.globalRateLimiter.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: SECTION_IDS.TRENDING, title: "In tendenza", type: DiscoverSectionType.featured },
      { id: SECTION_IDS.NEWEST, title: "Ultime aggiunte", type: DiscoverSectionType.simpleCarousel },
    ];
  }

  async getDiscoverSectionItems(section: DiscoverSection, metadata: { page?: number } | undefined): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const url = page <= 1 ? MANGA_WORLD_DOMAIN : buildUrl(MANGA_WORLD_DOMAIN, "/archive", { page, sort: section.id === SECTION_IDS.TRENDING ? "most_read" : "newest" });
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));

    const sourceItems = section.id === SECTION_IDS.TRENDING
      ? this.parser.parseHomeSectionItems($, "#chapters-slide .entry.vertical")
      : this.parser.parseSearchResults($);

    const items = sourceItems.map((item) => this.toDiscoverItem(item, section.id === SECTION_IDS.TRENDING ? "featuredCarouselItem" : "simpleCarouselItem"));

    return {
      items,
      metadata: items.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getSearchResults(query: SearchQuery, metadata: { page?: number } | undefined): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const url = buildUrl(MANGA_WORLD_DOMAIN, "/archive", { keyword: query.title ?? "", page });
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));
    const items = this.parser.parseSearchResults($).map((item) => this.toSearchItem(item));

    return {
      items,
      metadata: items.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = cheerio.load(await fetchText({ url: this.getMangaShareUrl(mangaId), method: "GET" }));
    return this.toSourceManga(this.parser.parseMangaDetails($, mangaId));
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const $ = cheerio.load(await fetchText({ url: this.getMangaShareUrl(sourceManga.mangaId), method: "GET" }));
    return this.parser.parseChapters($, sourceManga.mangaId).map((chapter, index) => this.toChapter(chapter, sourceManga, -index));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = buildUrl(MANGA_WORLD_DOMAIN, `/manga/${chapter.sourceManga.mangaId}/read/${chapter.chapterId}/1`, { style: "list" });
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));
    const details = this.parser.parseChapterDetails($, chapter.sourceManga.mangaId, chapter.chapterId);

    return { id: details.id, mangaId: details.mangaId, pages: details.pages };
  }

  private getMangaShareUrl(mangaId: string): string {
    return `${MANGA_WORLD_DOMAIN}/manga/${mangaId}/`;
  }

  private toSourceManga(details: MangaWorldMangaDetails): SourceManga {
    return {
      mangaId: details.id,
      mangaInfo: {
        primaryTitle: details.title,
        secondaryTitles: details.altTitles,
        synopsis: details.description ?? "",
        thumbnailUrl: details.image ?? MANGA_WORLD_PLACEHOLDER_IMAGE,
        author: details.authors.join(", "),
        artist: details.artists.join(", "),
        status: this.mapStatus(details.status),
        contentRating: pbconfig.contentRating,
        shareUrl: this.getMangaShareUrl(details.id),
        tagGroups: [{ id: "genres", title: "Generi", tags: details.genres.map((genre) => ({ id: genre.toLowerCase().replace(/\s+/g, "-"), title: genre })) }],
      },
    };
  }

  private toChapter(chapter: MangaWorldChapter, sourceManga: SourceManga, sortingIndex: number): Chapter {
    return {
      chapterId: chapter.id,
      sourceManga,
      title: chapter.name,
      chapNum: chapter.chapNum ?? 0,
      volume: chapter.volume ?? 0,
      publishDate: chapter.time,
      sortingIndex,
      langCode: "🇮🇹",
    };
  }

  private toSearchItem(item: MangaWorldSourceManga): SearchResultItem {
    return { mangaId: item.mangaId, title: item.title, subtitle: item.subtitle, imageUrl: item.image ?? MANGA_WORLD_PLACEHOLDER_IMAGE, contentRating: pbconfig.contentRating };
  }

  private toDiscoverItem(item: MangaWorldSourceManga, type: "featuredCarouselItem" | "simpleCarouselItem"): DiscoverSectionItem {
    return { type, mangaId: item.mangaId, title: item.title, subtitle: item.subtitle, imageUrl: item.image ?? MANGA_WORLD_PLACEHOLDER_IMAGE, contentRating: pbconfig.contentRating };
  }

  private mapStatus(status?: string): string {
    switch ((status ?? "").toLowerCase()) {
      case "in corso": return "Ongoing";
      case "finito": return "Completed";
      case "droppato": return "Dropped";
      case "in pausa": return "Hiatus";
      default: return "Unknown";
    }
  }
}

export const MangaWorld = new MangaWorldExtension();
