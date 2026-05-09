import { BasicRateLimiter, DiscoverSectionType, type Chapter, type ChapterDetails, type ChapterProviding, type DiscoverSection, type DiscoverSectionItem, type DiscoverSectionProviding, type Extension, type MangaProviding, type PagedResults, type SearchQuery, type SearchResultItem, type SearchResultsProviding, type SourceManga } from "@paperback/types";
import * as cheerio from "cheerio";

import { fetchText } from "../common/network";
import { ReadAllComicsParser, type ReadAllComicsChapter, type ReadAllComicsManga, type ReadAllComicsMangaDetails } from "../../lib/sources/ReadAllComics/ReadAllComicsParser";
import pbconfig from "./pbconfig";

const DOMAIN = "https://readallcomics.com";

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
        title: "Latest Updates",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
  }

  async getDiscoverSectionItems(section: DiscoverSection, metadata: undefined): Promise<PagedResults<DiscoverSectionItem>> {
    const $ = cheerio.load(await fetchText({ url: DOMAIN, method: "GET" }));

    const items = this.parser.parseHomeUpdates($).map((item) => ({
      type: "chapterUpdatesCarouselItem",
      mangaId: item.mangaId,
      chapterId: item.chapterId,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.image,
      contentRating: pbconfig.contentRating,
    }));

    return { items, metadata };
  }

  async getSearchResults(query: SearchQuery, metadata: undefined): Promise<PagedResults<SearchResultItem>> {
    const url = `${DOMAIN}/?s=${encodeURIComponent(query.title ?? "")}`;
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));

    const items = this.parser.parseSearchResults($).map((item: ReadAllComicsManga) => ({
      mangaId: item.mangaId,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.image,
      contentRating: pbconfig.contentRating,
    }));

    return { items, metadata };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = `${DOMAIN}/comic/${mangaId}`;
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));

    const details: ReadAllComicsMangaDetails = this.parser.parseMangaDetails($, mangaId);

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: details.title,
        secondaryTitles: details.altTitles,
        synopsis: details.description,
        thumbnailUrl: details.image,
        author: details.authors.join(", "),
        artist: details.artists.join(", "),
        shareUrl: url,
        contentRating: pbconfig.contentRating,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const url = `${DOMAIN}/comic/${sourceManga.mangaId}`;
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));

    return this.parser.parseChapters($, sourceManga.mangaId).map((chapter: ReadAllComicsChapter, index: number) => ({
      chapterId: chapter.id,
      sourceManga,
      title: chapter.name,
      chapNum: chapter.chapNum ?? 0,
      volume: chapter.volume ?? 0,
      sortingIndex: -index,
      publishDate: chapter.time,
      langCode: "🇬🇧",
    }));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = `${DOMAIN}/${chapter.chapterId}`;
    const $ = cheerio.load(await fetchText({ url, method: "GET" }));

    const details = this.parser.parseChapterDetails($, chapter.sourceManga.mangaId, chapter.chapterId);

    return {
      id: details.id,
      mangaId: details.mangaId,
      pages: details.pages,
    };
  }
}

export const ReadAllComics = new ReadAllComicsExtension();
