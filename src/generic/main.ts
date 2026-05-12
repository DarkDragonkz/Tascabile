/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  Form,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";
import {
  SearchFilterForm,
  type SearchFilter,
  type SearchFilterValue,
} from "@paperback/types/lib/compat/0.8";

import { Forms } from "./forms";
import type { MangaMetadata, WindowEntry } from "./models";
import { MainInterceptor, Requests } from "./network";
import { Parsers } from "./parsers";
import { filter, jsonParser, tags, types } from "./utils";

export { filter, jsonParser, tags, types } from "./utils";

export interface GenericParams {
  name: string;
  domain: string;
  contentRating: ContentRating;
  parser?: Parsers;
  requestManager?: Requests;
}

export abstract class MangaWorldGeneric
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
  public defaultContentRating = ContentRating.EVERYONE;
  parser: Parsers;
  requestManager: Requests;
  mainRateLimiter: BasicRateLimiter;
  mainInterceptor: MainInterceptor;

  protected constructor(params: GenericParams) {
    this.name = params.name;
    this.base_url = params.domain;
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
    this.parser = params.parser ?? new Parsers();
    this.requestManager = params.requestManager ?? new Requests();
    this.mainRateLimiter = new BasicRateLimiter("main", {
      numberOfRequests: 5,
      bufferInterval: 1,
      ignoreImages: true,
    });
    this.mainInterceptor = new MainInterceptor("main");
  }

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    await filter.populateFilter(this);
    return new Forms();
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    await filter.populateFilter(this);
    const filters: SearchFilter[] = [];
    const defValue = ((Application.getState("def_type") as string[]) ?? [])[0];
    const getExcludedTypeObject = {
      ...Object.fromEntries(
        filter
          .getMangaTypeFilter()
          .filter((option) => types.blacklistedType(option.id))
          .map((item) => [item.id, "excluded" as const]),
      ),
      ...(defValue ? { [defValue.toLowerCase()]: "included" as const } : {}),
    } as Record<string, "included" | "excluded">;

    const getExcludedValueObject = Object.fromEntries(
      filter
        .getGenreFilter()
        .filter((option) => tags.blacklistedTags([option.id]))
        .map((item) => [item.id, "excluded" as const]),
    ) as Record<string, "included" | "excluded">;

    filters.push({
      type: "multiselect",
      options: filter.getMangaTypeFilter(),
      id: "types",
      allowExclusion: true,
      title: "Tipologia",
      value: getExcludedTypeObject,
      allowEmptySelection: true,
      maximum: 3,
    });
    filters.push({
      type: "multiselect",
      options: filter.getGenreFilter(),
      id: "genres",
      allowExclusion: true,
      title: "Genere",
      value: getExcludedValueObject,
      allowEmptySelection: true,
      maximum: 5,
    });
    filters.push({
      type: "dropdown",
      options: filter.getStatusFilter(),
      id: "status",
      title: "Stato",
      value: "",
    });
    filters.push({
      type: "dropdown",
      options: filter.getYearFilter(),
      id: "year",
      title: "Anno",
      value: "",
    });
    return filters;
  }

  async getAdvancedSearchForm(query: SearchQuery<SearchFilterValue[]>) {
    return new SearchFilterForm(query.metadata, this.getSearchFilters());
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata: MangaMetadata | undefined,
    sorting: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const { url, excluded } = this.requestManager.constructSearchRequestURL(
      page,
      query,
      sorting,
      this,
    );
    const html = await this.requestManager.getSearchResultsRequests(url);
    const windowEntry = jsonParser.getWindowEntry(html);
    return await this.parser.parseSearchResults(excluded, this, metadata, windowEntry);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const data = this.requestManager.fetchPage(`${this.base_url}/manga/${mangaId}`);
    const html = Application.arrayBufferToUTF8String(await data);
    const windowEntry = jsonParser.getWindowEntry(html);
    return this.parser.parseMangaDetails(
      windowEntry,
      mangaId,
      `${this.base_url}/manga/${mangaId}`,
      this,
    );
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const data = this.requestManager.fetchPage(`${this.base_url}/manga/${sourceManga.mangaId}`);
    const html = Application.arrayBufferToUTF8String(await data);
    const windowEntry = jsonParser.getWindowEntry(html);
    return this.parser.parseChapters(windowEntry, sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const data = this.requestManager.fetchPage(
      `${this.base_url}/manga/${chapter.sourceManga.mangaId}`,
    );
    const html = Application.arrayBufferToUTF8String(await data);
    const windowEntry = jsonParser.getWindowEntry(html);
    return this.parser.parseChapterDetails(windowEntry, chapter.chapterId);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const discoverSection: DiscoverSection[] = [];
    if ((Application.getState("popular_section_enabled") as boolean) ?? true) {
      discoverSection.push({
        id: "popular_section",
        title: "Capitoli In Tendenza",
        type: DiscoverSectionType.featured,
      });
    }
    if ((Application.getState("mese_section_enabled") as boolean) ?? true) {
      discoverSection.push({
        id: "mese_section",
        title: "Tendenze del Mese",
        subtitle: "Più letti del mese",
        type: DiscoverSectionType.prominentCarousel,
      });
    }
    if ((Application.getState("most_read_section_enabled") as boolean) ?? true) {
      discoverSection.push({
        id: "most_read_section",
        title: "Più Letti",
        subtitle: "I più popolari di sempre",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if ((Application.getState("new_section_enabled") as boolean) ?? true) {
      discoverSection.push({
        id: "new_manga_section",
        title: "Nuove Aggiunte",
        subtitle: "Le nuove aggiunte",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if ((Application.getState("update_section_enabled") as boolean) ?? true) {
      discoverSection.push({
        id: "updated_section",
        title: "Aggiornati di Recente",
        subtitle: "Ultimi capitoli aggiunti",
        type: DiscoverSectionType.chapterUpdates,
      });
    }
    if (
      ((Application.getState("fav_tags_new") as string[])?.length ?? 0) > 0 &&
      ((Application.getState("fav_section_enabled") as boolean) ?? true)
    ) {
      discoverSection.push({
        id: "new_fav_type_section",
        title: "Nuove Aggiunte dei tuoi Generi Preferiti",
        subtitle: "Le nuove aggiunte dei tuoi generi preferiti",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if ((Application.getState("type_section_enabled") as boolean) ?? true) {
      discoverSection.push({
        id: "type_section",
        title: "Tipologia",
        subtitle: "Più letti di una tipologia",
        type: DiscoverSectionType.genres,
      });
    }
    if ((Application.getState("genre_section_enabled") as boolean) ?? true) {
      discoverSection.push({
        id: "genre_section",
        title: "Genere",
        subtitle: "Più letti di un genere",
        type: DiscoverSectionType.genres,
      });
    }
    return discoverSection;
  }

  async getSection(
    id: string,
    json: WindowEntry[],
    metadata: MangaMetadata,
  ): Promise<{ items: DiscoverSectionItem[]; metadata: MangaMetadata }> {
    let section: { items: DiscoverSectionItem[]; metadata: MangaMetadata } = {
      items: [],
      metadata,
    };
    const parsers: Record<
      string,
      () => Promise<{
        items: DiscoverSectionItem[];
        metadata: MangaMetadata;
      }>
    > = {
      updated_section: () => this.parser.parseChapterUpdateSection(metadata, this),
      most_read_section: () => this.parser.parseMostReadSection(metadata, this),
      new_manga_section: () => this.parser.parseLastAddedSection(metadata, this, false),
      new_fav_type_section: () => this.parser.parseLastAddedSection(metadata, this, true),
      genre_section: () => this.parser.parseGenreSection(this, metadata),
      type_section: () => this.parser.parseTypeSection(this, metadata),
    };

    if (id === "popular_section" || id === "mese_section") {
      for (const item of json) {
        if (id === "popular_section" && item.kind === "trending") {
          section = this.parser.parseTrendingChapters(metadata, this, item.data.mostViewedChapters);
          break;
        }

        if (id === "mese_section" && item.kind === "global") {
          section = this.parser.parseMonthTrending(metadata, this, item.data.globalData.topMangas);
          break;
        }
      }
    }

    if (section.items.length > 1) return section;
    const sectionParser = parsers[id];
    if (sectionParser) return await sectionParser();
    return section;
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: MangaMetadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const html = Application.arrayBufferToUTF8String(await this.requestManager.fetchPage(this.base_url));
    const windowEntry = jsonParser.getWindowEntry(html);
    return await this.getSection(section.id, windowEntry, metadata);
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    await filter.populateFilter(this);
    return filter.getOrderFilter().map((item) => ({
      id: item.id,
      label: item.value,
    }));
  }
}
