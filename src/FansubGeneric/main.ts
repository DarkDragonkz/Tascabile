import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type JSONValue,
  type MangaProviding,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";
import { APIRequests, MainInterceptor } from "./network";
import { FansubGeneralParsers } from "./parsers";

export interface FansubGenericParams {
  name: string;
  domain: string;
  contentRating: ContentRating;
}

abstract class FansubGeneral
  implements
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding
{
  readonly name: string;
  public base_url = "";
  public defaultContentRating = ContentRating.EVERYONE;
  parser: FansubGeneralParsers;
  requestManager: APIRequests;
  mainRateLimiter: BasicRateLimiter;
  mainInterceptor: MainInterceptor;

  protected constructor(params: FansubGenericParams) {
    this.name = params.name;
    this.base_url = params.domain;
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
    this.parser = new FansubGeneralParsers();
    this.requestManager = new APIRequests(this.base_url);
    this.mainRateLimiter = new BasicRateLimiter("fansub-main", {
      numberOfRequests: 2,
      bufferInterval: 1,
      ignoreImages: true,
    });
    this.mainInterceptor = new MainInterceptor("fansub-main");
  }

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
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
    _metadata: JSONValue | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    return this.parser.parseSectionHome(this, section);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "section",
        title: "Tendenze",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
  }

  async getSearchResults(
    query: SearchQuery<JSONValue>,
    _metadata: JSONValue | undefined,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    return await this.parser.parseSearchResults(query, this);
  }
}

export default FansubGeneral;
