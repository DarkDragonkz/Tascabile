import { BasicRateLimiter, DiscoverSectionType, type Chapter, type ChapterDetails, type ChapterProviding, type DiscoverSection, type DiscoverSectionItem, type DiscoverSectionProviding, type Extension, type MangaProviding, type PagedResults, type SearchQuery, type SearchResultItem, type SearchResultsProviding, type SourceManga } from "@paperback/types";
import * as cheerio from "cheerio";

import { fetchText } from "../common/network";
import { buildUrl } from "../../lib/core/url";
import { READ_ALL_COMICS_DOMAIN, READ_ALL_COMICS_PLACEHOLDER_IMAGE } from "../../lib/sources/ReadAllComics/constants";
import { ReadAllComicsParser, type ReadAllComicsChapter, type ReadAllComicsDetails, type ReadAllComicsSeries } from "../../lib/sources/ReadAllComics/ReadAllComicsParser";
import pbconfig from "./pbconfig";

export class ReadAllComicsExtension implements Extension, SearchResultsProviding, MangaProviding, ChapterProviding, DiscoverSectionProviding {
  globalRateLimiter = new BasicRateLimiter("readallcomics", {
    numberOfRequests: 2,
    bufferInterval: 1,
    ignoreImages: true,
  });

  private readonly parser = new ReadAllComicsParser();

  async initialise(): Promise<void> {
    this.globalRateLimiter.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "latest",
        title: "Latest Series",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(_section: DiscoverSection, metadata: { page?: number } | undefined): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const url = page <= 1 ? READ_ALL_COMICS_DOMAIN : `${READ_ALL_COMICS_DOMAIN}/page/${page}/`;
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));
    const series = this.parser.parseSeriesList($);

    return {
      items: series.map((item) => this.toDiscoverItem(item)),
      metadata: series.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getSearchResults(query: SearchQuery, metadata: { page?: number } | undefined): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const url = buildUrl(READ_ALL_COMICS_DOMAIN, "/", {
      story: query.title ?? "",
      s: "",
      type: "comic",
      paged: page > 1 ? page : undefined,
    });

    const $ = cheerio.load(await fetchText({ url, method: "GET" }));
    const series = this.parser.parseSeriesList($);

    return {
      items: series.map((item) => this.toSearchItem(item)),
      metadata: series.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = cheerio.load(await fetchText({ url: this.getMangaShareUrl(mangaId), method: "GET" }));
    const details = this.parser.parseSeriesDetails($, mangaId);
    const series = this.parser.parseSeriesList($)[0];

    return this.toSourceManga({
      ...details,
      image: series?.image ?? details.image,
      publisher: series?.publisher ?? details.publisher,
      genres: series?.genres ?? details.genres,
      year: series?.year ?? details.year,
      issueCount: series?.issueCount ?? details.issueCount,
    });
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const $ = cheerio.load(await fetchText({ url: this.getMangaShareUrl(sourceManga.mangaId), method: "GET" }));

    return this.parser
      .parseChapters($, sourceManga.mangaId)
      .map((chapter, index) => this.toChapter(chapter, sourceManga, -index));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = this.getChapterUrl(chapter.chapterId);
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));
    const details = this.parser.parseChapterDetails($, chapter.sourceManga.mangaId, chapter.chapterId);

    return {
      id: details.id,
      mangaId: details.mangaId,
      pages: details.pages,
    };
  }

  private getMangaShareUrl(mangaId: string): string {
    return `${READ_ALL_COMICS_DOMAIN}/category/${mangaId}/`;
  }

  private getChapterUrl(chapterId: string): string {
    if (chapterId.startsWith("http")) {
      return chapterId;
    }

    return `${READ_ALL_COMICS_DOMAIN}/${chapterId.replace(/^\/+/, "")}/`;
  }

  private toSourceManga(details: ReadAllComicsDetails): SourceManga {
    const synopsisParts = [
      details.description ?? "",
      details.publisher ? `Publisher: ${details.publisher}` : "",
      details.year ? `Year: ${details.year}` : "",
      details.issueCount ? `Issues: ${details.issueCount}` : "",
    ].filter(Boolean);

    return {
      mangaId: details.id,
      mangaInfo: {
        primaryTitle: details.title,
        synopsis: synopsisParts.join("\n"),
        thumbnailUrl: details.image ?? READ_ALL_COMICS_PLACEHOLDER_IMAGE,
        status: "Unknown",
        contentRating: pbconfig.contentRating,
        shareUrl: this.getMangaShareUrl(details.id),
        tagGroups: [
          {
            id: "genres",
            title: "Genres",
            tags: details.genres.map((genre) => ({
              id: genre.toLowerCase().replace(/\s+/g, "-"),
              title: genre,
            })),
          },
        ],
      },
    };
  }

  private toChapter(chapter: ReadAllComicsChapter, sourceManga: SourceManga, sortingIndex: number): Chapter {
    return {
      chapterId: chapter.id,
      sourceManga,
      title: chapter.name,
      chapNum: chapter.chapNum ?? 0,
      volume: chapter.volume ?? 0,
      publishDate: chapter.time,
      sortingIndex,
      langCode: "🇬🇧",
    };
  }

  private toSearchItem(series: ReadAllComicsSeries): SearchResultItem {
    return {
      mangaId: series.mangaId,
      title: series.title,
      subtitle: series.subtitle,
      imageUrl: series.image ?? READ_ALL_COMICS_PLACEHOLDER_IMAGE,
      contentRating: pbconfig.contentRating,
    };
  }

  private toDiscoverItem(series: ReadAllComicsSeries): DiscoverSectionItem {
    return {
      type: "simpleCarouselItem",
      mangaId: series.mangaId,
      title: series.title,
      subtitle: series.subtitle,
      imageUrl: series.image ?? READ_ALL_COMICS_PLACEHOLDER_IMAGE,
      contentRating: pbconfig.contentRating,
    };
  }
}

export const ReadAllComics = new ReadAllComicsExtension();
