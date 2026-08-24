import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
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

import { FansubSettingsForm } from "./forms";
import { APIRequests, MainInterceptor } from "./network";
import { FansubGeneralParsers } from "./parsers";
import { FansubSearchForm, type FansubSearchMeta } from "./search";

export interface FansubGenericParams {
  name: string;
  domain: string;
  contentRating: ContentRating;
}

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

  async getSettingsForm(): Promise<Form> {
    return new FansubSettingsForm(this);
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const metadata = query.metadata as { searchMeta?: FansubSearchMeta } | undefined;
    return new FansubSearchForm(metadata?.searchMeta);
  }

  getMangaDetails(mangaId: string): Promise<SourceManga> {
    return this.parser.parseMangaDetails(mangaId, this);
  }

  getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    return this.parser.parseChapterDetails(chapter, this);
  }

  getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    return this.parser.parseChapters(sourceManga, this);
  }

  getDiscoverSectionItems(
    section: DiscoverSection,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    return this.parser.parseSectionHome(this, section);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [];
    if ((Application.getState("fansub_featured_enabled") as boolean) ?? true) {
      sections.push({
        id: "featured",
        title: "In evidenza",
        subtitle: "Serie aggiornate di recente",
        type: DiscoverSectionType.featured,
      });
    }
    if ((Application.getState("fansub_recent_enabled") as boolean) ?? true) {
      sections.push({
        id: "recent",
        title: "Aggiornati di recente",
        subtitle: "Ultimi capitoli pubblicati",
        type: DiscoverSectionType.chapterUpdates,
      });
    }
    if ((Application.getState("fansub_catalog_enabled") as boolean) ?? true) {
      sections.push({
        id: "catalog",
        title: "Catalogo",
        subtitle: "Tutte le serie disponibili",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    return sections;
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    _metadata: Metadata | undefined,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    return this.parser.parseSearchResults(query, this);
  }

  shouldHideAdult(adult: number): boolean {
    return ((Application.getState("fansub_hide_adult") as boolean) ?? false) && adult === 1;
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
