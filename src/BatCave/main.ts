import {
  CloudflareError,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  PaperbackInterceptor,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
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

const BASE_URL = "https://batcave.biz";

type BatCaveMetadata = {
  page?: number;
  collectedIds?: string[];
};

type ChapterData = {
  id: number;
  title?: string;
  posi: number;
  date: string;
};

type ParsedChapterData = {
  chapters?: ChapterData[];
};

type ReaderData = {
  images?: string[];
};

class BatCaveInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    const referer = request.url.includes("readcomicsonline.ru")
      ? "https://readcomicsonline.ru"
      : BASE_URL;

    request.headers = {
      ...request.headers,
      origin: referer,
      referer,
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

class BatCaveExtension
  implements
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding
{
  readonly requestManager = new BatCaveInterceptor("batcave-main");
  readonly cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "popular_section",
        title: "Popular",
        type: DiscoverSectionType.featured,
      },
      {
        id: "catalogue_section",
        title: "Catalogue",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "new_comic_section",
        title: "New Comics",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: BatCaveMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    switch (section.id) {
      case "popular_section":
        return this.getPopularSectionItems(metadata);
      case "catalogue_section":
        return this.getCatalogueSectionItems(metadata);
      case "new_comic_section":
        return this.getNewComicsSectionItems(metadata);
      default:
        return { items: [] };
    }
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata: BatCaveMetadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const title = query.title.trim();

    if (!title) {
      const catalogueResults = await this.getCatalogueSectionItems(metadata);
      return {
        items: catalogueResults.items.flatMap((item) => {
          if (item.type !== "simpleCarouselItem") return [];
          return [
            {
              mangaId: item.mangaId,
              imageUrl: item.imageUrl,
              title: item.title,
              subtitle: item.subtitle,
              metadata: undefined,
            },
          ];
        }),
        metadata: catalogueResults.metadata,
      };
    }

    const $ = await this.fetchCheerio({
      url: page > 1 ? `${BASE_URL}/search/${encodeURIComponent(title)}/page/${page}/` : `${BASE_URL}/search/${encodeURIComponent(title)}`,
      method: "GET",
    } as Request);
    const searchResults: SearchResultItem[] = [];

    $(".readed").each((_, element) => {
      const unit = $(element);
      const infoLink = unit.find(".readed__title a").first();
      const title = infoLink.text().trim();
      const image = this.normalizeImage(unit.find(".readed__img img").first().attr("data-src") || unit.find(".readed__img img").first().attr("src") || "");
      const mangaId = this.normalizeMangaId(infoLink.attr("href") ?? "");
      const latestChapter = unit.find(".readed__info li:last-child").text().trim().replace("Last issue:", "").trim().replace(/.*#(\d+).*/u, "#$1");

      if (!title || !mangaId) return;

      searchResults.push({
        mangaId,
        imageUrl: image,
        title,
        subtitle: latestChapter,
        metadata: undefined,
      });
    });

    return {
      items: searchResults,
      metadata: this.hasNextPaginationPage($, page) ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchCheerio({
      url: `${BASE_URL}/${mangaId}.html`,
      method: "GET",
    } as Request);

    const title = $("h1").first().text().trim();
    const image = this.normalizeImage($(".page__poster img").first().attr("src") || "");
    const description = $(".page__text").text().trim();
    const ratingMatch = $(".page__rating-votes").text().match(/(\d+(\.\d+)?)/u);
    const rating = ratingMatch?.[1] ? Number(ratingMatch[1]) : 0;
    const statusText = $(".page__list li")
      .filter((_, element) => $(element).text().includes("Release type"))
      .first()
      .text()
      .toLowerCase();
    const status = statusText.includes("completed")
      ? "COMPLETED"
      : statusText.includes("ongoing")
        ? "ONGOING"
        : "UNKNOWN";

    const genres: string[] = [];
    $(".page__tags a").each((_, element) => {
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
        rating,
        contentRating: ContentRating.EVERYONE,
        status,
        tagGroups,
        shareUrl: `${BASE_URL}/${mangaId}.html`,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const $ = await this.fetchCheerio({
      url: `${BASE_URL}/${sourceManga.mangaId}.html`,
      method: "GET",
    } as Request);
    const chapters: Chapter[] = [];
    const chapterScript = $(".page__chapters-list script")
      .filter((_, element) => $(element).html()?.includes("__DATA__") ?? false)
      .first()
      .html() || "";
    const jsonMatch = chapterScript.match(/window\.__DATA__\s*=\s*({[\s\S]*?});/u);

    if (!jsonMatch?.[1]) return chapters;

    try {
      const parsedData = JSON.parse(jsonMatch[1]) as ParsedChapterData;
      parsedData.chapters?.forEach((chapter) => {
        if (!chapter.id || typeof chapter.id !== "number") return;
        const dateParts = chapter.date.split(".").map(Number);
        const day = dateParts[0] ?? 1;
        const month = dateParts[1] ?? 1;
        const year = dateParts[2] ?? 1970;
        const isoDate = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

        chapters.push({
          chapterId: chapter.id.toString(),
          title: chapter.title || `Chapter ${chapter.posi}`,
          sourceManga,
          chapNum: chapter.posi,
          publishDate: new Date(isoDate),
          volume: 0,
          langCode: "en",
        });
      });
    } catch {
      return [];
    }

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const $ = await this.fetchCheerio({
      url: `${BASE_URL}/reader/${chapter.sourceManga.mangaId.split("-")[0]}/${chapter.chapterId}`,
      method: "GET",
    } as Request);
    const pages: string[] = [];
    const scriptData = $("script")
      .filter((_, element) => $(element).html()?.includes("__DATA__") ?? false)
      .first()
      .html();
    const jsonMatch = scriptData?.match(/window\.__DATA__\s*=\s*({[\s\S]*?})\s*;/u);

    if (jsonMatch?.[1]) {
      try {
        const data = JSON.parse(jsonMatch[1]) as ReaderData;
        if (data.images && Array.isArray(data.images)) {
          pages.push(...data.images.map((image) => image.replace(/\\\//gu, "/")));
        }
      } catch {
        return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: [] };
      }
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  async getCatalogueSectionItems(
    metadata: BatCaveMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const collectedIds = metadata?.collectedIds ?? [];
    const url = page > 1 ? `${BASE_URL}/comix/page/${page}/` : `${BASE_URL}/comix/`;
    const $ = await this.fetchCheerio({ url, method: "GET" } as Request);
    const items: DiscoverSectionItem[] = [];

    $("#dle-content .readed, .readed").each((_, element) => {
      const unit = $(element);
      const infoLink = unit.find(".readed__title a").first();
      const title = infoLink.text().trim();
      const image = this.normalizeImage(unit.find(".readed__img img").first().attr("data-src") || unit.find(".readed__img img").first().attr("src") || "");
      const mangaId = this.normalizeMangaId(infoLink.attr("href") ?? "");
      const latestChapter = unit.find(".readed__info li:last-child").text().trim().replace("Last issue:", "").trim();

      if (!title || !mangaId || collectedIds.includes(mangaId)) return;
      collectedIds.push(mangaId);
      items.push(this.createSimpleItem(mangaId, image, title, latestChapter));
    });

    return {
      items,
      metadata: this.hasNextPaginationPage($, page) ? { page: page + 1, collectedIds } : undefined,
    };
  }

  async getPopularSectionItems(
    metadata: BatCaveMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const collectedIds = metadata?.collectedIds ?? [];
    const $ = await this.fetchCheerio({ url: BASE_URL, method: "GET" } as Request);
    const items: DiscoverSectionItem[] = [];

    $(".poster.grid-item, a.poster").each((_, element) => {
      const unit = $(element);
      const title = unit.find(".poster__title").text().trim() || unit.find("img").first().attr("alt") || "";
      const image = this.normalizeImage(unit.find(".poster__img img").first().attr("data-src") || unit.find("img").first().attr("data-src") || "");
      const mangaId = this.normalizeMangaId(unit.attr("href") ?? "");
      const rating = unit.find(".poster__label--rate").text().trim();

      if (!title || !mangaId || collectedIds.includes(mangaId)) return;
      collectedIds.push(mangaId);
      items.push({
        mangaId,
        imageUrl: image,
        title,
        supertitle: rating ? `Rating: ${rating}` : undefined,
        type: "featuredCarouselItem",
        contentRating: ContentRating.EVERYONE,
      });
    });

    return { items, metadata: undefined };
  }

  async getNewComicsSectionItems(
    metadata: BatCaveMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const collectedIds = metadata?.collectedIds ?? [];
    const url = page > 1 ? `${BASE_URL}/page/${page}/` : `${BASE_URL}/`;
    const $ = await this.fetchCheerio({ url, method: "GET" } as Request);
    const items: DiscoverSectionItem[] = [];

    $("#content-load .latest.grid-item").each((_, element) => {
      const unit = $(element);
      const title = unit.find(".latest__title a").clone().children().remove().end().text().trim();
      const image = this.normalizeImage(unit.find(".latest__img img").attr("src") || unit.find(".latest__img img").attr("data-src") || "");
      const mangaId = this.normalizeMangaId(unit.find(".latest__title a").attr("href") ?? "");
      const latestChapter = unit.find(".latest__chapter a").text().trim();

      if (!title || !mangaId || collectedIds.includes(mangaId)) return;
      collectedIds.push(mangaId);
      items.push(this.createSimpleItem(mangaId, image, title, latestChapter));
    });

    if (items.length === 0) {
      $(".sect--hot .poster.grid-item, .sect--hot a.poster").each((_, element) => {
        const unit = $(element);
        const title = unit.find(".poster__title").text().trim() || unit.find("img").first().attr("alt") || "";
        const image = this.normalizeImage(unit.find("img").first().attr("data-src") || "");
        const mangaId = this.normalizeMangaId(unit.attr("href") ?? "");
        if (!title || !mangaId || collectedIds.includes(mangaId)) return;
        collectedIds.push(mangaId);
        items.push(this.createSimpleItem(mangaId, image, title));
      });
    }

    return {
      items,
      metadata: $(".pagination__btn-loader a").length > 0 ? { page: page + 1, collectedIds } : undefined,
    };
  }

  getMangaShareUrl(mangaId: string): string {
    return `${BASE_URL}/${mangaId}.html`;
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
    const html = Application.arrayBufferToUTF8String(data);

    if (
      response.status === 503 ||
      response.status === 403 ||
      html.includes("/_v") ||
      (html.includes("window.performance") && html.includes("crypto.subtle"))
    ) {
      throw new CloudflareError({
        url: BASE_URL,
        method: "GET",
        headers: {
          referer: BASE_URL,
          origin: BASE_URL,
        },
      } as Request);
    }

    return cheerio.load(html);
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
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return `${BASE_URL}${trimmed}`;
    return `${BASE_URL}/${trimmed}`;
  }

  private normalizeMangaId(value: string): string {
    return value
      .replace(/^https?:\/\/batcave\.biz\//iu, "")
      .replace(/^\/+|\/+$/gu, "")
      .replace(/\.html$/iu, "")
      .trim();
  }

  private hasNextPaginationPage($: CheerioAPI, page: number): boolean {
    return (
      $(".pagination__pages > a")
        .toArray()
        .some((element) => {
          const pageNumber = Number($(element).text().trim());
          return Number.isFinite(pageNumber) && pageNumber > page;
        }) || $(".pagination__btn-loader a").length > 0
    );
  }
}

export const BatCave = new BatCaveExtension();
