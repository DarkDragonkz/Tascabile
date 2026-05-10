import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  PaperbackInterceptor,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
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
} from "@paperback/types";
import type { SearchFilterValue } from "@paperback/types/lib/compat/0.8";
import * as cheerio from "cheerio";

const BASE_URL = "https://readallcomics.com";

type PageMetadata = {
  page: number;
};

type ParsedComicCard = {
  mangaId: string;
  title: string;
  imageUrl: string;
  subtitle: string;
};

class ReadAllComicsInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      Referer: `${BASE_URL}/`,
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
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

class ReadAllComicsExtension
  implements
    Extension,
    MangaProviding,
    ChapterProviding,
    SearchResultsProviding,
    DiscoverSectionProviding
{
  readonly mainRateLimiter = new BasicRateLimiter("readallcomics-main", {
    numberOfRequests: 4,
    bufferInterval: 1,
    ignoreImages: true,
  });

  readonly interceptor = new ReadAllComicsInterceptor("readallcomics-main");

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.interceptor.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "latest_comics",
        title: "Latest Comics",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: PageMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    void section;

    const page = metadata?.page ?? 1;
    const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`;
    const html = await this.fetchText(url);
    const cards = this.parseComicCards(html);

    return {
      items: cards.map((card) => ({
        type: "simpleCarouselItem",
        mangaId: card.mangaId,
        title: card.title,
        subtitle: card.subtitle,
        imageUrl: card.imageUrl,
        contentRating: ContentRating.EVERYONE,
        metadata: { page: page + 1 },
      })),
      metadata: this.hasNextPage(html) ? { page: page + 1 } : undefined,
    };
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata: PageMetadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const title = query.title.trim();
    const searchPath = title.length > 0 ? `?story=${encodeURIComponent(title)}&s=&type=comic` : "";
    const pagePath = page > 1 ? `&paged=${page}` : "";
    const html = await this.fetchText(`${BASE_URL}/${searchPath}${pagePath}`);
    const cards = this.parseComicCards(html);

    return {
      items: cards.map((card) => ({
        mangaId: card.mangaId,
        title: card.title,
        subtitle: card.subtitle,
        imageUrl: card.imageUrl,
        contentRating: ContentRating.EVERYONE,
        metadata: { page: page + 1 },
      })),
      metadata: this.hasNextPage(html) ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = this.mangaIdToUrl(mangaId);
    const html = await this.fetchText(url);
    const $ = cheerio.load(html);

    const title = this.cleanText($("h1").first().text()) || this.cleanText($("title").text());
    const description =
      this.cleanText($(".description-archive").text()) ||
      this.cleanText($("meta[name='description']").attr("content"));
    const imageUrl = this.normalizeUrl(
      $(".description-archive img").first().attr("src") ||
        $("meta[property='og:image']").attr("content") ||
        "",
    );
    const genres = this.extractLabeledValue($, "Genres:");
    const publisher = this.extractLabeledValue($, "Publisher:");

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl: imageUrl,
        synopsis: description,
        contentRating: ContentRating.EVERYONE,
        status: "Unknown",
        author: publisher,
        artist: "",
        tagGroups:
          genres.length > 0
            ? [
                {
                  id: "genres",
                  title: "Genres",
                  tags: genres.split(",").map((genre) => {
                    const trimmed = this.cleanText(genre);
                    return { id: trimmed.toLowerCase().replace(/\s+/gu, "-"), title: trimmed };
                  }),
                },
              ]
            : [],
        shareUrl: url,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const url = this.mangaIdToUrl(sourceManga.mangaId);
    const html = await this.fetchText(url);
    const $ = cheerio.load(html);
    const chapters: Chapter[] = [];

    $(".group-box.list a, ul.list-story a").each((index, element) => {
      const href = $(element).attr("href");
      const title = this.cleanText($(element).text());
      if (!href || title.length === 0) return;
      if (href.includes("/category/")) return;

      chapters.push({
        chapterId: this.urlToId(href),
        sourceManga,
        title,
        chapNum: this.extractChapterNumber(title, chapters.length + 1),
        langCode: "en",
        sortingIndex: index,
      });
    });

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = this.mangaIdToUrl(chapter.chapterId);
    const html = await this.fetchText(url);
    const $ = cheerio.load(html);
    const pages: string[] = [];

    $(".entry-content img, .separator img, article img, .index-wrapper img").each((_, element) => {
      const imageUrl = this.normalizeUrl(
        $(element).attr("data-src") || $(element).attr("data-lazy-src") || $(element).attr("src") || "",
      );
      if (imageUrl.length === 0) return;
      if (imageUrl.includes("logo")) return;
      if (imageUrl.includes("readallcomics-1.jpg")) return;
      if (pages.includes(imageUrl)) return;
      pages.push(imageUrl);
    });

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  private async fetchText(url: string): Promise<string> {
    const data = (
      await Application.scheduleRequest({
        url,
        method: "GET",
      })
    )[1];
    return Application.arrayBufferToUTF8String(data);
  }

  private parseComicCards(html: string): ParsedComicCard[] {
    const $ = cheerio.load(html);
    const cards: ParsedComicCard[] = [];

    $("ul.list-story.categories > li, .list-story.categories > li").each((_, element) => {
      const titleElement = $(element).find("a.cat-title").first();
      const title = this.cleanText(titleElement.text());
      const href = titleElement.attr("href") || $(element).find("a.book-link").first().attr("href") || "";
      const image = $(element).find("img.book-cover").first();
      const imageUrl = this.normalizeUrl(image.attr("data-src") || image.attr("src") || "");
      const publisher = this.cleanText($(element).find(".cat-publisher").text()).replace(
        /^Publisher:\s*/iu,
        "",
      );
      const year = this.cleanText($(element).find(".cat-vol").first().text());
      const issueCount = this.cleanText($(element).find(".issue-count").first().text());
      const subtitleParts = [publisher, year, issueCount].filter((value) => value.length > 0);

      if (title.length === 0 || href.length === 0) return;

      cards.push({
        mangaId: this.urlToId(href),
        title,
        imageUrl,
        subtitle: subtitleParts.join(" · "),
      });
    });

    if (cards.length > 0) return cards;

    $("article, .post, .type-post").each((_, element) => {
      const anchor = $(element).find("a").first();
      const title =
        this.cleanText($(element).find("h2, h1, .entry-title").first().text()) ||
        this.cleanText(anchor.text());
      const href = anchor.attr("href") ?? "";
      const imageUrl = this.normalizeUrl($(element).find("img").first().attr("src") ?? "");
      if (title.length === 0 || href.length === 0) return;
      cards.push({
        mangaId: this.urlToId(href),
        title,
        imageUrl,
        subtitle: "",
      });
    });

    return cards;
  }

  private hasNextPage(html: string): boolean {
    const $ = cheerio.load(html);
    return $("a.next, a.nextpostslink, link[rel='next']").length > 0;
  }

  private extractLabeledValue($: cheerio.CheerioAPI, label: string): string {
    const text = this.cleanText($(".description-archive").text());
    const labelIndex = text.toLowerCase().indexOf(label.toLowerCase());
    if (labelIndex < 0) return "";
    const valueStart = labelIndex + label.length;
    const remaining = text.slice(valueStart).trim();
    const nextBreak = remaining.search(/Publisher:|Genres:|\n/iu);
    return this.cleanText(nextBreak >= 0 ? remaining.slice(0, nextBreak) : remaining);
  }

  private extractChapterNumber(title: string, fallback: number): number {
    const match = title.match(/(?:#|\b)(\d+(?:\.\d+)?)/u);
    if (!match?.[1]) return fallback;
    return Number(match[1]);
  }

  private mangaIdToUrl(mangaId: string): string {
    if (mangaId.startsWith("http://") || mangaId.startsWith("https://")) return mangaId;
    return `${BASE_URL}/${mangaId.replace(/^\/+|\/+$/gu, "")}/`;
  }

  private urlToId(url: string): string {
    const withoutQuery = url.split("?")[0] ?? url;
    const withoutHash = withoutQuery.split("#")[0] ?? withoutQuery;
    const withoutDomain = withoutHash.replace(/^https?:\/\/readallcomics\.com\//iu, "");
    return withoutDomain.replace(/^\/+|\/+$/gu, "");
  }

  private normalizeUrl(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    return `${BASE_URL}/${trimmed.replace(/^\/+/, "")}`;
  }

  private cleanText(value: string | undefined): string {
    return value?.replace(/\s+/gu, " ").trim() ?? "";
  }
}

export const ReadAllComics = new ReadAllComicsExtension();
