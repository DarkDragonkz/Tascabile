import {
  CloudflareError,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  PaperbackInterceptor,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type CloudflareBypassRequestProviding,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type PagedResults,
  type Request,
  type Response,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SourceManga,
  type TagSection,
} from "@paperback/types";
import type { SearchFilterValue } from "@paperback/types/lib/compat/0.8";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

const BASE_URL = "https://readcomicsonline.ru";

type ReadComicsOnlineMetadata = {
  page?: number;
  collectedIds?: string[];
};

type SearchSuggestion = {
  value: string;
  data: string;
};

type SearchResponse = {
  suggestions?: SearchSuggestion[];
};

class ReadComicsOnlineInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      origin: BASE_URL,
      referer: BASE_URL,
      "user-agent": await Application.getDefaultUserAgent(),
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.5",
      "accept-encoding": "gzip, deflate, br",
      "x-requested-with": "com.batcave.android",
    };
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    void request;
    void response;
    return data;
  }
}

class ReadComicsOnlineExtension
  implements
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    CloudflareBypassRequestProviding,
    DiscoverSectionProviding
{
  readonly requestManager = new ReadComicsOnlineInterceptor("readcomicsonline-main");
  readonly cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
  }

  async getCloudflareBypassRequest(): Promise<Request> {
    return {
      url: BASE_URL,
      method: "GET",
      headers: {
        referer: BASE_URL,
        origin: BASE_URL,
        "user-agent": await Application.getDefaultUserAgent(),
      },
    } as Request;
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "popular_section",
        title: "Popular",
        type: DiscoverSectionType.featured,
      },
      {
        id: "hot_comic_updates_section",
        title: "Hot Comic Updates",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "latest_comic_updates_section",
        title: "Latest Comic Updates",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: ReadComicsOnlineMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    switch (section.id) {
      case "popular_section":
        return this.getPopularSectionItems(metadata);
      case "hot_comic_updates_section":
        return this.getHotComicsSectionItems(metadata);
      case "latest_comic_updates_section":
        return this.getLatestComicsSectionItems(metadata);
      default:
        return { items: [] };
    }
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata: ReadComicsOnlineMetadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const itemsPerPage = 10;
    const searchTitle = query.title.trim();

    if (!searchTitle) {
      return { items: [] };
    }

    const [response, data] = await Application.scheduleRequest({
      url: `${BASE_URL}/search?query=${encodeURIComponent(searchTitle)}`,
      method: "GET",
    } as Request);
    await this.checkCloudflareStatus(response.status);

    const responseText = Application.arrayBufferToUTF8String(data);
    const parsed = JSON.parse(responseText) as SearchResponse;
    const suggestions = parsed.suggestions ?? [];
    const searchResults = suggestions.map((item) => ({
      mangaId: item.data,
      title: item.value,
      imageUrl: `${BASE_URL}/uploads/manga/${item.data}/cover/cover_250x350.jpg`,
      type: "searchResultItem" as const,
    }));

    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    return {
      items: searchResults.slice(startIndex, endIndex),
      metadata: endIndex < searchResults.length ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchCheerio({
      url: `${BASE_URL}/comic/${mangaId}`,
      method: "GET",
    } as Request);

    const title = $("h2.listmanga-header").first().text().trim();
    const rawImage = $(".boxed img").attr("src") || "";
    const image = this.normalizeImage(rawImage);
    const description = $(".manga.well p").text().trim();
    const author = $("dt:contains('Author') + dd a").text().trim();
    const ratingMatch = $(".rating").text().match(/Average\s*([\d.]+)/u);
    const rating = ratingMatch?.[1] ? Number(ratingMatch[1]) * 20 : 0;
    const statusText = $("dt:contains('Status') + dd span").text().toLowerCase();
    const status = statusText.includes("ongoing")
      ? "ONGOING"
      : statusText.includes("completed")
        ? "COMPLETED"
        : "UNKNOWN";

    const genres: string[] = [];
    $("dd.tag-links a").each((_, element) => {
      const genre = $(element).text().trim();
      if (genre) genres.push(genre);
    });

    const tagGroups: TagSection[] = genres.length > 0
      ? [
          {
            id: "genres",
            title: "Genres",
            tags: genres.map((genre) => ({
              id: genre.toLowerCase().replace(/[^a-z0-9]/gu, ""),
              title: genre,
            })),
          },
        ]
      : [];

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl: image,
        synopsis: description,
        author,
        rating,
        contentRating: ContentRating.EVERYONE,
        status,
        tagGroups,
        shareUrl: `${BASE_URL}/comic/${mangaId}`,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const $ = await this.fetchCheerio({
      url: `${BASE_URL}/comic/${sourceManga.mangaId}`,
      method: "GET",
    } as Request);
    const chapters: Chapter[] = [];

    $(".chapters li").each((_, element) => {
      const chapterElement = $(element);
      const titleElement = chapterElement.find("h5.chapter-title-rtl a");
      const chapterTitle = titleElement.text().trim();
      const chapterUrl = titleElement.attr("href") || "";
      const chapterId = chapterUrl
        .replace(/^https?:\/\/readcomicsonline\.ru\/comic\/[^/]+/iu, "")
        .trim();
      const dateText = chapterElement.find(".date-chapter-title-rtl").text().trim();
      const publishDate = this.parsePublishDate(dateText);
      const chapNum = this.extractChapterNumber(chapterTitle);

      if (!chapterId || !chapterTitle) return;

      chapters.push({
        chapterId,
        title: chapterTitle,
        sourceManga,
        chapNum,
        publishDate,
        volume: 0,
        langCode: "en",
      });
    });

    return chapters.sort((a, b) => (a.publishDate?.getTime() || 0) - (b.publishDate?.getTime() || 0));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const $ = await this.fetchCheerio({
      url: `${BASE_URL}/comic/${chapter.sourceManga.mangaId}${chapter.chapterId}`,
      method: "GET",
    } as Request);
    const pages: string[] = [];

    $("#all img").each((_, element) => {
      const dataSrc = $(element).attr("data-src");
      if (dataSrc) pages.push(this.normalizeImage(dataSrc.trim()));
    });

    if (pages.length === 0) {
      const singlePageSrc = $("#ppp img").attr("src");
      if (singlePageSrc) pages.push(this.normalizeImage(singlePageSrc.trim()));
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  async getHotComicsSectionItems(
    metadata: ReadComicsOnlineMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const collectedIds = metadata?.collectedIds ?? [];
    const $ = await this.fetchCheerio({ url: BASE_URL, method: "GET" } as Request);
    const items: DiscoverSectionItem[] = [];

    $("#schedule .schedule-item").each((_, element) => {
      const unit = $(element);
      const titleLink = unit.find(".schedule-name a");
      const title = titleLink.text().trim();
      const image = this.normalizeImage(unit.find(".schedule-avatar img").attr("src") || "");
      const mangaId = this.normalizeMangaId(titleLink.attr("href") || "");
      const latestChapter = unit.find(".schedule-date a").text().trim();

      if (!title || !mangaId || collectedIds.includes(mangaId)) return;
      collectedIds.push(mangaId);
      items.push(this.createSimpleItem(mangaId, image, title, latestChapter));
    });

    return { items, metadata: undefined };
  }

  async getPopularSectionItems(
    metadata: ReadComicsOnlineMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const collectedIds = metadata?.collectedIds ?? [];
    const $ = await this.fetchCheerio({ url: BASE_URL, method: "GET" } as Request);
    const items: DiscoverSectionItem[] = [];

    $(".list-group-item").each((_, element) => {
      const unit = $(element);
      const titleLink = unit.find(".chart-title");
      const title = titleLink.text().trim();
      const mangaId = this.normalizeMangaId(titleLink.attr("href") || "");
      const image = this.normalizeImage((unit.find("img").attr("src") || "").replace("cover_thumb.jpg", "cover_250x350.jpg"));
      const viewText = unit.find(".fa-eye").parent().text().trim();
      const viewCount = viewText.replace(/[^\d]/gu, "");

      if (!title || !mangaId || collectedIds.includes(mangaId)) return;
      collectedIds.push(mangaId);
      items.push({
        mangaId,
        imageUrl: image,
        title,
        supertitle: viewCount ? `Views: ${viewCount}` : undefined,
        type: "featuredCarouselItem",
        contentRating: ContentRating.EVERYONE,
      });
    });

    return { items, metadata: undefined };
  }

  async getLatestComicsSectionItems(
    metadata: ReadComicsOnlineMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const collectedIds = metadata?.collectedIds ?? [];
    const $ = await this.fetchCheerio({ url: BASE_URL, method: "GET" } as Request);
    const items: DiscoverSectionItem[] = [];

    $(".col-sm-6 .media").each((_, element) => {
      const unit = $(element);
      const titleLink = unit.find(".media-heading a");
      const title = titleLink.text().trim();
      const mangaId = this.normalizeMangaId(titleLink.attr("href") || "");
      const image = this.normalizeImage((unit.find(".media-left img").attr("src") || "").replace("cover_thumb.jpg", "cover_250x350.jpg"));
      const latestChapter = unit.find("div a[href*='/comic/']").first().text().trim();

      if (!title || !mangaId || collectedIds.includes(mangaId)) return;
      collectedIds.push(mangaId);
      items.push(this.createSimpleItem(mangaId, image, title, latestChapter));
    });

    return {
      items,
      metadata: $(".pagination li a[rel='next']").length > 0 ? { page: page + 1, collectedIds } : undefined,
    };
  }

  getMangaShareUrl(mangaId: string): string {
    return `${BASE_URL}/comic/${mangaId}`;
  }

  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    for (const cookie of this.cookieStorageInterceptor.cookies) {
      this.cookieStorageInterceptor.deleteCookie(cookie);
    }

    for (const cookie of cookies) {
      if (cookie.expires && cookie.expires.getTime() <= Date.now()) continue;
      this.cookieStorageInterceptor.setCookie(cookie);
    }
  }

  private async fetchCheerio(request: Request): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest(request);
    await this.checkCloudflareStatus(response.status);
    return cheerio.load(Application.arrayBufferToUTF8String(data));
  }

  private async checkCloudflareStatus(status: number): Promise<void> {
    switch (status) {
      case 503:
      case 403:
        throw new CloudflareError(
          {
            url: BASE_URL,
            method: "GET",
            headers: {
              referer: BASE_URL,
              origin: BASE_URL,
            },
          } as Request,
          "Cloudflare bypass required, please complete the challenge.",
        );
      case 404:
        throw new Error("Content not found");
    }
  }

  private createSimpleItem(
    mangaId: string,
    imageUrl: string,
    title: string,
    subtitle?: string,
  ): DiscoverSectionItem {
    return {
      type: "simpleCarouselItem",
      mangaId,
      imageUrl,
      title,
      subtitle,
      metadata: undefined,
      contentRating: ContentRating.EVERYONE,
    };
  }

  private normalizeImage(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("/")) return `${BASE_URL}${trimmed}`;
    return `${BASE_URL}/${trimmed}`;
  }

  private normalizeMangaId(value: string): string {
    return value
      .replace(/^https?:\/\/readcomicsonline\.ru\/comic\//iu, "")
      .replace(/^\/+|\/+$/gu, "")
      .trim();
  }

  private parsePublishDate(value: string): Date | undefined {
    const parts = value.split(" ").filter((part) => part.length > 0);
    if (parts.length < 3) return undefined;

    const day = Number(parts[0]);
    const monthName = parts[1]?.replace(".", "") ?? "";
    const year = Number(parts[2]);
    const month = new Date(Date.parse(`${monthName} 1, 2000`)).getMonth() + 1;

    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
      return undefined;
    }

    return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  private extractChapterNumber(title: string): number {
    const regularMatch = title.match(/#(\d+(?:\.\d+)?)/u);
    if (regularMatch?.[1]) return Number(regularMatch[1]);

    const annualMatch = title.match(/#(?:-\s*)?Annual\s+(\d+)/iu);
    if (annualMatch?.[1]) return Number(annualMatch[1]);

    return 0;
  }
}

export const ReadComicsOnline = new ReadComicsOnlineExtension();
