import {
  BasicRateLimiter,
  ContentRating,
  Form,
  type AdvancedSearchForm,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";

import type { ComicListItem, ComicsListResponse } from "./models";
import { APIRequests, MainInterceptor } from "./network";
import { FansubGeneralParsers } from "./parsers";

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
    DiscoverSectionProviding
{
  readonly name: string;
  public base_url = "";
  public siteRoot = "";
  public defaultContentRating = ContentRating.EVERYONE;
  parser: FansubGeneralParsers;
  requestManager: APIRequests;
  mainRateLimiter: BasicRateLimiter;
  mainInterceptor: MainInterceptor;

  protected constructor(params: FansubGenericParams) {
    this.name = params.name;
    this.base_url = params.domain;
    this.siteRoot = params.domain.replace(/\/api\/?$/u, "").replace(/\/+$/u, "");
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
    this.parser = new FansubGeneralParsers();
    this.requestManager = new APIRequests(this.base_url);
    this.mainRateLimiter = new BasicRateLimiter(`fansub-${params.name}`, {
      numberOfRequests: 4,
      bufferInterval: 1,
      ignoreImages: true,
    });
    this.mainInterceptor = new MainInterceptor(`fansub-${params.name}`, this.siteRoot);
  }

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
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
    const raw = await this.requestManager.apiMangaDetails("", true);
    const parsed = JSON.parse(raw) as ComicsListResponse;
    return parsed.comics.filter((comic) => !this.shouldHideAdult(comic.adult));
  }

  protected async loadSearchComics(query: SearchQuery<Metadata>): Promise<ComicListItem[]> {
    const raw = await this.requestManager.apiSearchResult(query);
    const parsed = JSON.parse(raw) as ComicsListResponse;
    return parsed.comics.filter((comic) => !this.shouldHideAdult(comic.adult));
  }

  protected comicTimestamp(comic: ComicListItem): number {
    const value = comic.last_chapter?.published_on;
    const parsed = value ? new Date(value).getTime() : 0;
    return Number.isFinite(parsed) ? parsed : 0;
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

  protected toSearchResult(comic: ComicListItem): SearchResultItem {
    return {
      mangaId: comic.slug,
      title: comic.title,
      imageUrl: this.normalizeUrl(comic.thumbnail),
      subtitle: comic.author ?? "",
      contentRating: this.contentRatingFor(comic.adult),
    };
  }

  protected toSimpleItem(comic: ComicListItem): DiscoverSectionItem {
    return {
      type: "simpleCarouselItem",
      mangaId: comic.slug,
      imageUrl: this.normalizeUrl(comic.thumbnail),
      title: comic.title,
      subtitle: comic.author ?? "",
      contentRating: this.contentRatingFor(comic.adult),
    };
  }

  protected toFeaturedItem(comic: ComicListItem, fallbackSupertitle: string): DiscoverSectionItem {
    return {
      type: "featuredCarouselItem",
      mangaId: comic.slug,
      imageUrl: this.normalizeUrl(comic.thumbnail),
      title: comic.title,
      supertitle:
        comic.last_chapter?.title ?? comic.last_chapter?.full_title ?? fallbackSupertitle,
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
      imageUrl: this.normalizeUrl(comic.thumbnail),
      title: comic.title,
      subtitle: chapter.title ?? chapter.full_title,
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
      const raw = await this.requestManager.apiMangaDetails("", true);
      const parsed = JSON.parse(raw) as ComicsListResponse;
      return Array.isArray(parsed.comics);
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
