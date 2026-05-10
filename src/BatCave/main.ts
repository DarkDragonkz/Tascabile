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

const BASE_URL = "https://batcave.biz";
const IMAGE_PLACEHOLDER_PREFIX = "data:image/gif";

type PageMetadata = {
  page: number;
};

type ParsedComicCard = {
  mangaId: string;
  title: string;
  imageUrl: string;
  subtitle: string;
  rating?: string;
};

type JsonLdGraphNode = {
  "@type"?: string | string[];
  "@id"?: string;
  name?: string;
  url?: string;
  image?: string;
  thumbnailUrl?: string;
  description?: string;
  genre?: string[];
  publisher?: { name?: string } | { "@id"?: string };
  author?: Array<{ name?: string }>;
  illustrator?: Array<{ name?: string }>;
  itemListElement?: Array<{
    position?: number;
    url?: string;
    name?: string;
    item?: {
      url?: string;
      name?: string;
      issueNumber?: string;
    };
  }>;
  hasPart?: {
    itemListElement?: Array<{
      position?: number;
      item?: {
        url?: string;
        name?: string;
        issueNumber?: string;
      };
    }>;
  };
};

type JsonLdDocument = JsonLdGraphNode | { "@graph": JsonLdGraphNode[] };

type ReaderData = {
  news_id?: number;
  chapter_id?: number;
  images?: string[];
  pages?: number;
  chapters?: Array<{
    id: number;
    title: string;
    title_en?: string;
  }>;
};

class BatCaveInterceptor extends PaperbackInterceptor {
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

class BatCaveExtension
  implements
    Extension,
    MangaProviding,
    ChapterProviding,
    SearchResultsProviding,
    DiscoverSectionProviding
{
  readonly mainRateLimiter = new BasicRateLimiter("batcave-main", {
    numberOfRequests: 4,
    bufferInterval: 1,
    ignoreImages: true,
  });

  readonly interceptor = new BatCaveInterceptor("batcave-main");

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.interceptor.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "popular_comics",
        title: "Popular Comics",
        subtitle: "Featured on BatCave",
        type: DiscoverSectionType.prominentCarousel,
      },
      {
        id: "hot_releases",
        title: "Hot New Releases",
        subtitle: "Recently highlighted comics",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "catalogue",
        title: "Catalogue",
        subtitle: "Latest catalogue page",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: PageMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const url = section.id === "catalogue" ? this.catalogueUrl(page) : `${BASE_URL}/`;
    const html = await this.fetchText(url);
    const cards = this.parseCards(html, section.id);

    if (section.id === "popular_comics") {
      return {
        items: cards.slice(0, 16).map((card) => ({
          type: "prominentCarouselItem",
          mangaId: card.mangaId,
          title: card.title,
          imageUrl: card.imageUrl,
          contentRating: ContentRating.EVERYONE,
        })),
        metadata: undefined,
      };
    }

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
      metadata: section.id === "catalogue" && this.hasNextPage(html) ? { page: page + 1 } : undefined,
    };
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata: PageMetadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const title = query.title.trim();
    const baseSearchUrl = title.length > 0 ? `${BASE_URL}/search/${encodeURIComponent(title)}` : `${BASE_URL}/comix/`;
    const url = page === 1 ? baseSearchUrl : `${baseSearchUrl}/page/${page}/`;
    const html = await this.fetchText(url);
    const cards = this.parseCards(html, "search");

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
    const jsonLd = this.findJsonLdNode(html, "ComicSeries");

    const title =
      this.cleanText(jsonLd?.name) ||
      this.cleanText($("h1").first().text()) ||
      this.cleanText($("title").text());
    const thumbnailUrl = this.normalizeUrl(
      this.cleanText(jsonLd?.thumbnailUrl) ||
        this.cleanText(jsonLd?.image) ||
        $(".page__poster img").first().attr("src") ||
        $("link[rel='preload'][as='image']").first().attr("href") ||
        "",
    );
    const synopsis =
      this.cleanText(jsonLd?.description) ||
      this.cleanText($(
        ".page__text, .full-text, .tabs__block .page__text",
      ).first().text()) ||
      this.cleanText($("meta[name='description']").attr("content"));
    const publisher = this.extractListValue($, "Publisher:") || this.extractJsonName(jsonLd?.publisher);
    const author = this.extractPeople(jsonLd?.author) || this.extractListValue($, "Writer:");
    const artist = this.extractPeople(jsonLd?.illustrator) || this.extractListValue($, "Artist:");
    const status = this.extractListValue($, "Release type:") || "Unknown";
    const genres = jsonLd?.genre ?? this.parseTagTitles($);

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl,
        synopsis,
        contentRating: ContentRating.EVERYONE,
        status,
        author: author || publisher,
        artist,
        tagGroups:
          genres.length > 0
            ? [
                {
                  id: "genres",
                  title: "Genres",
                  tags: genres.map((genre) => ({
                    id: genre.toLowerCase().replace(/\s+/gu, "-"),
                    title: genre,
                  })),
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
    const jsonLd = this.findJsonLdNode(html, "ComicSeries");
    const chaptersFromJson = jsonLd?.hasPart?.itemListElement ?? [];

    if (chaptersFromJson.length > 0) {
      return chaptersFromJson
        .map((entry, index) => {
          const chapterUrl = entry.item?.url ?? "";
          const title = this.cleanText(entry.item?.name) || `Issue ${entry.item?.issueNumber ?? index + 1}`;
          return {
            chapterId: this.urlToId(chapterUrl),
            sourceManga,
            title,
            chapNum: this.toNumber(entry.item?.issueNumber, index + 1),
            langCode: "en",
            sortingIndex: index,
          };
        })
        .filter((chapter) => chapter.chapterId.length > 0);
    }

    const readerLinks = this.extractReaderLinks(html);
    return readerLinks.map((item, index) => ({
      chapterId: item.chapterId,
      sourceManga,
      title: item.title,
      chapNum: this.extractChapterNumber(item.title, index + 1),
      langCode: "en",
      sortingIndex: index,
    }));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = this.mangaIdToUrl(chapter.chapterId);
    const html = await this.fetchText(url);
    const readerData = this.extractReaderData(html);
    const imagesFromData = readerData?.images ?? [];
    const images = imagesFromData.length > 0 ? imagesFromData : this.extractReaderImages(html);

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: images.map((image) => this.normalizeUrl(image)),
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

  private parseCards(html: string, sectionId: string): ParsedComicCard[] {
    const $ = cheerio.load(html);
    const selector = sectionId === "hot_releases" ? ".sect--hot .poster, .sect--hot a[href$='.html']" : ".poster, a[href$='.html']";
    const cards: ParsedComicCard[] = [];

    $(selector).each((_, element) => {
      const href = $(element).attr("href") ?? "";
      if (!this.isComicUrl(href)) return;

      const title =
        this.cleanText($(element).find(".poster__title").first().text()) ||
        this.cleanText($(element).find("img").first().attr("alt")) ||
        this.cleanText($(element).text());
      const image = $(element).find("img").first();
      const imageUrl = this.normalizeUrl(
        image.attr("data-src") ||
          (image.attr("src")?.startsWith(IMAGE_PLACEHOLDER_PREFIX) ? "" : image.attr("src")) ||
          "",
      );
      const subtitle = $(element)
        .find(".poster__subtitle li")
        .toArray()
        .map((item) => this.cleanText($(item).text()))
        .filter((item) => item.length > 0)
        .join(" · ");
      const rating = this.cleanText($(element).find(".poster__label--rate").first().text());

      if (title.length === 0) return;

      cards.push({
        mangaId: this.urlToId(href),
        title,
        imageUrl,
        subtitle,
        rating,
      });
    });

    const withRegexFallback = cards.length > 0 ? cards : this.parsePosterCardsByRegex(html);
    const withJsonFallback = withRegexFallback.length > 0 ? withRegexFallback : this.parseItemListCards(html);
    return this.deduplicateCards(withJsonFallback);
  }

  private parsePosterCardsByRegex(html: string): ParsedComicCard[] {
    const cards: ParsedComicCard[] = [];
    const posterPattern = /<a\b[^>]*class=["'][^"']*poster[^"']*["'][^>]*href=["']([^"']+)["'][\s\S]*?<\/a>/giu;
    let match: RegExpExecArray | null;

    while ((match = posterPattern.exec(html)) !== null) {
      const block = match[0];
      const href = match[1] ?? "";
      if (!this.isComicUrl(href)) continue;

      const title =
        this.decodeHtml(this.matchFirst(block, /<p\b[^>]*class=["'][^"']*poster__title[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu)) ||
        this.decodeHtml(this.matchFirst(block, /alt=["']([^"']+)["']/iu));
      const imageUrl = this.normalizeUrl(
        this.matchFirst(block, /data-src=["']([^"']+)["']/iu) ||
          this.matchFirst(block, /src=["']([^"']+)["']/iu),
      );
      if (title.length === 0) continue;

      cards.push({
        mangaId: this.urlToId(href),
        title,
        imageUrl: imageUrl.startsWith(IMAGE_PLACEHOLDER_PREFIX) ? "" : imageUrl,
        subtitle: "",
      });
    }

    return cards;
  }

  private parseItemListCards(html: string): ParsedComicCard[] {
    const itemList = this.findJsonLdNode(html, "ItemList");
    const items = itemList?.itemListElement ?? [];
    return items
      .map((item) => {
        const href = item.item?.url ?? item.url ?? "";
        const title = this.cleanText(item.item?.name ?? item.name);
        return {
          mangaId: this.urlToId(href),
          title,
          imageUrl: "",
          subtitle: "",
        };
      })
      .filter((card) => card.mangaId.length > 0 && card.title.length > 0);
  }

  private deduplicateCards(cards: ParsedComicCard[]): ParsedComicCard[] {
    const seen = new Set<string>();
    const result: ParsedComicCard[] = [];
    for (const card of cards) {
      if (seen.has(card.mangaId)) continue;
      seen.add(card.mangaId);
      result.push(card);
    }
    return result;
  }

  private findJsonLdNode(html: string, type: string): JsonLdGraphNode | undefined {
    const $ = cheerio.load(html);
    const scripts = $("script[type='application/ld+json']")
      .toArray()
      .map((element) => $(element).text());

    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script) as JsonLdDocument;
        const graph: JsonLdGraphNode[] = "@graph" in parsed ? parsed["@graph"] : [parsed];
        const node = graph.find((entry) => {
          const entryType = entry["@type"];
          return Array.isArray(entryType) ? entryType.includes(type) : entryType === type;
        });
        if (node) return node;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  private extractReaderData(html: string): ReaderData | undefined {
    const match = html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\})\s*;<\/script>/u);
    if (!match?.[1]) return undefined;
    try {
      return JSON.parse(match[1]) as ReaderData;
    } catch {
      return undefined;
    }
  }

  private extractReaderImages(html: string): string[] {
    const $ = cheerio.load(html);
    const images: string[] = [];
    $("#ssr-shell img, .reader-view img, link[rel='preload'][as='image']").each((_, element) => {
      const raw =
        $(element).attr("href") ||
        $(element).attr("data-src") ||
        $(element).attr("src") ||
        "";
      const imageUrl = this.normalizeUrl(raw);
      if (imageUrl.length === 0) return;
      if (images.includes(imageUrl)) return;
      images.push(imageUrl);
    });
    return images;
  }

  private extractReaderLinks(html: string): Array<{ chapterId: string; title: string }> {
    const readerData = this.extractReaderData(html);
    if (readerData?.news_id && readerData.chapters) {
      return readerData.chapters.map((chapter) => ({
        chapterId: `reader/${readerData.news_id}/${chapter.id}`,
        title: this.cleanText(chapter.title_en || chapter.title),
      }));
    }

    const $ = cheerio.load(html);
    const links: Array<{ chapterId: string; title: string }> = [];
    $("a[href*='/reader/']").each((_, element) => {
      const href = $(element).attr("href") ?? "";
      const title = this.cleanText($(element).text()) || this.cleanText($(element).attr("title"));
      if (href.length === 0 || title.length === 0) return;
      links.push({ chapterId: this.urlToId(href), title });
    });
    return links;
  }

  private parseTagTitles($: cheerio.CheerioAPI): string[] {
    return $(".page__tags a")
      .toArray()
      .map((element) => this.cleanText($(element).text()))
      .filter((tag) => tag.length > 0);
  }

  private extractListValue($: cheerio.CheerioAPI, label: string): string {
    const row = $(".page__list li")
      .toArray()
      .find((element) => this.cleanText($(element).find("div").first().text()) === label);
    if (!row) return "";
    const cloned = $(row).clone();
    cloned.find("div").remove();
    return this.cleanText(cloned.text());
  }

  private extractPeople(people: Array<{ name?: string }> | undefined): string {
    return people?.map((person) => this.cleanText(person.name)).filter((name) => name.length > 0).join(", ") ?? "";
  }

  private extractJsonName(value: JsonLdGraphNode["publisher"]): string {
    if (!value || !("name" in value)) return "";
    return this.cleanText(value.name);
  }

  private catalogueUrl(page: number): string {
    return page === 1 ? `${BASE_URL}/comix/` : `${BASE_URL}/comix/page/${page}/`;
  }

  private mangaIdToUrl(mangaId: string): string {
    if (mangaId.startsWith("http://") || mangaId.startsWith("https://")) return mangaId;
    return `${BASE_URL}/${mangaId.replace(/^\/+|\/+$/gu, "")}`;
  }

  private urlToId(url: string): string {
    const withoutQuery = url.split("?")[0] ?? url;
    const withoutHash = withoutQuery.split("#")[0] ?? withoutQuery;
    const withoutDomain = withoutHash.replace(/^https?:\/\/batcave\.biz\//iu, "");
    return withoutDomain.replace(/^\/+|\/+$/gu, "");
  }

  private normalizeUrl(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    return `${BASE_URL}/${trimmed.replace(/^\/+/, "")}`;
  }

  private isComicUrl(value: string): boolean {
    const url = this.normalizeUrl(value);
    return url.startsWith(`${BASE_URL}/`) && url.endsWith(".html") && !url.includes("/reader/");
  }

  private matchFirst(value: string, pattern: RegExp): string {
    return value.match(pattern)?.[1] ?? "";
  }

  private decodeHtml(value: string): string {
    return this.cleanText(
      value
        .replace(/<[^>]+>/gu, " ")
        .replace(/&amp;/gu, "&")
        .replace(/&#039;/gu, "'")
        .replace(/&quot;/gu, '"')
        .replace(/&ndash;/gu, "–")
        .replace(/&mdash;/gu, "—"),
    );
  }

  private extractChapterNumber(title: string, fallback: number): number {
    const match = title.match(/(?:#|Issue\s+|\b)(\d+(?:\.\d+)?)/iu);
    if (!match?.[1]) return fallback;
    return Number(match[1]);
  }

  private toNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private hasNextPage(html: string): boolean {
    const $ = cheerio.load(html);
    return $("a.next, a.nextpostslink, .navigation a:contains('Next'), link[rel='next']").length > 0;
  }

  private cleanText(value: string | undefined): string {
    return value?.replace(/\s+/gu, " ").trim() ?? "";
  }
}

export const BatCave = new BatCaveExtension();
