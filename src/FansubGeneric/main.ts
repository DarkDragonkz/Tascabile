import {
  BasicRateLimiter,
  ContentRating,
  CookieStorageInterceptor,
  Form,
  type AdvancedSearchForm,
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
  type Metadata,
  type PagedResults,
  type Request,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";

import { INFO_SYMBOLS, infoItems, relativeDateIt } from "../common/discover";
import { chapterLabel, matchesQuery } from "./chapters";
import type { ComicListItem } from "./models";
import { APIRequests, MainInterceptor, searchSegment } from "./network";
import { FansubGeneralParsers } from "./parsers";

// Cookies from the Cloudflare check without an expiry would otherwise be dropped at once.
const BYPASS_COOKIE_FALLBACK_MS = 12 * 60 * 60 * 1000;

export interface FansubGenericParams {
  name: string;
  domain: string;
  contentRating: ContentRating;
}

export type CatalogSort = "recent" | "title_asc" | "title_desc" | "author";

abstract class FansubGeneral
  implements
    SettingsFormProviding,
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding,
    CloudflareBypassRequestProviding
{
  readonly name: string;
  public base_url = "";
  public siteRoot = "";
  public defaultContentRating = ContentRating.EVERYONE;
  parser: FansubGeneralParsers;
  requestManager: APIRequests;
  mainRateLimiter: BasicRateLimiter;
  mainInterceptor: MainInterceptor;
  cookieStorageInterceptor: CookieStorageInterceptor;

  protected constructor(params: FansubGenericParams) {
    this.name = params.name;
    this.base_url = params.domain;
    this.siteRoot = params.domain.replace(/\/api\/?$/u, "").replace(/\/+$/u, "");
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
    this.parser = new FansubGeneralParsers();
    this.requestManager = new APIRequests(this.base_url);
    // Display names contain spaces ("Phoenix Scans"); keep interceptor IDs space-free.
    // Paperback keeps one interceptor per ID: the limiter needs an ID of its own, or
    // registering the main interceptor replaces it and requests are never throttled.
    const interceptorId = `fansub-${params.name.replace(/\s+/gu, "")}`;
    this.mainRateLimiter = new BasicRateLimiter(`${interceptorId}-rate`, {
      numberOfRequests: 4,
      bufferInterval: 1,
      ignoreImages: true,
    });
    this.mainInterceptor = new MainInterceptor(interceptorId, this.siteRoot);
    // Keeps the Cloudflare clearance (`cf_clearance`) after the in-app check.
    this.cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  }

  async initialise(): Promise<void> {
    this.mainInterceptor.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.mainRateLimiter.registerInterceptor();
  }

  async cloudflareBypassCompleted(
    _request: Request,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ): Promise<void> {
    const fallbackExpiry = new Date(Date.now() + BYPASS_COOKIE_FALLBACK_MS);
    for (const cookie of cookies) {
      if (cookie.expires && cookie.expires.getTime() <= Date.now()) continue;
      this.cookieStorageInterceptor.setCookie(
        cookie.expires ? cookie : { ...cookie, expires: fallbackExpiry },
      );
    }
    this.mainInterceptor.markBypassCompleted();
  }

  abstract getSettingsForm(): Promise<Form>;

  abstract getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm>;

  abstract getDiscoverSections(): Promise<DiscoverSection[]>;

  abstract getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>>;

  abstract getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
    sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>>;

  getMangaDetails(mangaId: string): Promise<SourceManga> {
    return this.parser.parseMangaDetails(mangaId, this);
  }

  getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    return this.parser.parseChapterDetails(chapter, this);
  }

  getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    return this.parser.parseChapters(sourceManga, this);
  }

  protected getHideAdult(): boolean {
    return false;
  }

  shouldHideAdult(adult: number): boolean {
    return this.getHideAdult() && adult === 1;
  }

  protected async loadCatalog(): Promise<ComicListItem[]> {
    return (await this.requestManager.catalog()).filter(
      (comic) => !this.shouldHideAdult(comic.adult),
    );
  }

  protected async loadSearchComics(query: SearchQuery<Metadata>): Promise<ComicListItem[]> {
    const title = query.title.trim();
    if (!title) return this.loadCatalog();
    // Titles the search endpoint cannot answer (short, or with a slash such as
    // "1/2 Principe") are matched locally on the catalogue; network errors still surface.
    const segment = searchSegment(title);
    const comics = segment
      ? await this.requestManager.search(segment)
      : (await this.requestManager.catalog()).filter((comic) => matchesQuery(comic, title));
    return comics.filter((comic) => !this.shouldHideAdult(comic.adult));
  }

  protected comicTimestamp(comic: ComicListItem): number {
    const value = comic.last_chapter?.published_on;
    const parsed = value ? new Date(value).getTime() : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  protected comicDate(comic: ComicListItem): Date | undefined {
    const timestamp = this.comicTimestamp(comic);
    return timestamp > 0 ? new Date(timestamp) : undefined;
  }

  protected updatedWithin(comic: ComicListItem, days: number): boolean {
    const timestamp = this.comicTimestamp(comic);
    if (timestamp <= 0) return false;
    return Date.now() - timestamp <= days * 86_400_000;
  }

  protected sortCatalog(comics: ComicListItem[], sort: CatalogSort): ComicListItem[] {
    const result = [...comics];
    if (sort === "recent") {
      return result.sort((a, b) => this.comicTimestamp(b) - this.comicTimestamp(a));
    }
    if (sort === "title_asc") {
      return result.sort((a, b) => a.title.localeCompare(b.title, "it"));
    }
    if (sort === "title_desc") {
      return result.sort((a, b) => b.title.localeCompare(a.title, "it"));
    }
    return result.sort((a, b) => (a.author ?? "").localeCompare(b.author ?? "", "it"));
  }

  // Full-size covers reach several MB; lists use the site's 150px thumbnail.
  // Manga details keep the original cover.
  protected listThumbnail(comic: ComicListItem): string {
    return this.normalizeUrl(comic.thumbnail_small || comic.thumbnail);
  }

  protected toSearchResult(comic: ComicListItem): SearchResultItem {
    return {
      mangaId: comic.slug,
      title: comic.title,
      imageUrl: this.listThumbnail(comic),
      subtitle: comic.author || undefined,
      contentRating: this.contentRatingFor(comic.adult),
    };
  }

  protected toSimpleItem(comic: ComicListItem): DiscoverSectionItem {
    return {
      type: "simpleCarouselItem",
      mangaId: comic.slug,
      imageUrl: this.listThumbnail(comic),
      title: comic.title,
      subtitle: comic.author ?? "",
      contentRating: this.contentRatingFor(comic.adult),
    };
  }

  protected toFeaturedItem(comic: ComicListItem, fallbackSupertitle: string): DiscoverSectionItem {
    return {
      type: "featuredCarouselItem",
      mangaId: comic.slug,
      imageUrl: this.listThumbnail(comic),
      title: comic.title,
      supertitle: comic.last_chapter ? chapterLabel(comic.last_chapter) : fallbackSupertitle,
      infoItems: infoItems(
        { symbol: INFO_SYMBOLS.date, text: relativeDateIt(this.comicDate(comic)) },
        { symbol: INFO_SYMBOLS.author, text: comic.author ?? undefined },
      ),
      contentRating: this.contentRatingFor(comic.adult),
    };
  }

  protected toChapterUpdateItem(comic: ComicListItem): DiscoverSectionItem | undefined {
    const chapter = comic.last_chapter;
    if (!chapter?.url) return undefined;
    return {
      type: "chapterUpdatesCarouselItem",
      mangaId: comic.slug,
      chapterId: chapter.url,
      imageUrl: this.listThumbnail(comic),
      title: comic.title,
      subtitle: chapterLabel(chapter),
      publishDate: new Date(chapter.published_on),
      contentRating: this.contentRatingFor(comic.adult),
    };
  }

  protected contentRatingFor(adult: number): ContentRating {
    return adult === 1 ? ContentRating.ADULT : this.defaultContentRating;
  }

  async checkApi(): Promise<boolean> {
    try {
      this.requestManager.clearCache();
      await this.requestManager.catalog();
      return true;
    } catch {
      return false;
    }
  }

  clearNetworkCache(): void {
    this.requestManager.clearCache();
  }

  normalizeUrl(rawUrl: string | undefined): string {
    const value = rawUrl?.trim().replace(/\\\//gu, "/") ?? "";
    if (!value) return "";
    if (/^https:\/\//iu.test(value)) return value;
    if (/^http:\/\//iu.test(value)) return value.replace(/^http:/iu, "https:");
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("/")) return `${this.siteRoot}${value}`;
    return `${this.siteRoot}/${value.replace(/^\/+/, "")}`;
  }

  normalizePages(pages: string[]): string[] {
    return [
      ...new Set(
        pages.map((page) => this.normalizeUrl(page)).filter((page): page is string => !!page),
      ),
    ];
  }
}

export default FansubGeneral;
