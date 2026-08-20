/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

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
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";

import { Forms } from "./forms";
import {
  parseChapterDetailsHtml,
  parseChaptersHtml,
  parseHeroDiscoverHtml,
  parseMangaDetailsHtml,
  parseSearchHtml,
  parseSimpleDiscoverHtml,
} from "./htmlFallbacks";
import type { MangaMetadata, MangaWorldSearchMetadata } from "./models";
import { MainInterceptor, Requests } from "./network";
import { Parsers } from "./parsers";
import {
  HOME_CACHE_SECONDS,
  MANGA_CACHE_SECONDS,
  READER_CACHE_SECONDS,
  getFavoriteGenres,
  isMigratedAdultGenreHidden,
} from "./preferences";
import { MangaWorldAdvancedSearchForm } from "./search";
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
    return new Forms(this);
  }

  async getAdvancedSearchForm(
    query: SearchQuery<MangaWorldSearchMetadata>,
  ): Promise<AdvancedSearchForm> {
    await filter.populateFilter(this);
    return new MangaWorldAdvancedSearchForm(query);
  }

  async getSearchResults(
    query: SearchQuery<MangaWorldSearchMetadata>,
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

    try {
      const entries = jsonParser.getWindowEntry(html);
      const cards = this.parser.parsePage(this, entries).filter(
        (item) =>
          !this.hiddenManga(item.tags, item.type) &&
          !tags.excludedTags(item.tags, excluded.generi) &&
          !types.excludedTypes(item.type, excluded.tipi),
      );
      const items: SearchResultItem[] = cards.map((item) => ({
        mangaId: item.id,
        imageUrl: item.image,
        title: item.title,
        subtitle: item.authors || item.type,
        contentRating: this.rating(item.tags),
      }));
      const searchInfo = entries.find((entry) => entry.kind === "searchInfo");
      const hasMore = searchInfo ? page < searchInfo.data.totalPages : items.length > 0;
      return { items, metadata: hasMore ? { page: page + 1 } : undefined };
    } catch {
      return parseSearchHtml(html, this, metadata, excluded);
    }
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = `${this.base_url}/manga/${mangaId}`;
    const html = await this.requestManager.fetchText(url, MANGA_CACHE_SECONDS);

    try {
      return this.parser.parseMangaDetails(jsonParser.getWindowEntry(html), mangaId, url, this);
    } catch {
      return parseMangaDetailsHtml(html, mangaId, url, this);
    }
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const url = `${this.base_url}/manga/${sourceManga.mangaId}`;
    const html = await this.requestManager.fetchText(url, MANGA_CACHE_SECONDS);

    try {
      const chapters = this.parser.parseChapters(jsonParser.getWindowEntry(html), sourceManga);
      if (chapters.length > 0) return chapters;
    } catch {
      // Fall back to the visible chapter list when MangaWorld changes its JSON payload.
    }

    return parseChaptersHtml(html, sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaUrl = `${this.base_url}/manga/${chapter.sourceManga.mangaId}`;
    const mangaHtml = await this.requestManager.fetchText(mangaUrl, MANGA_CACHE_SECONDS);

    try {
      const details = this.parser.parseChapterDetails(
        jsonParser.getWindowEntry(mangaHtml),
        chapter.chapterId,
      );
      if (!("pages" in details) || details.pages.length > 0) return details;
    } catch {
      // Fall through to the actual reader page.
    }

    const readerUrl = `${mangaUrl}/read/${chapter.chapterId}`;
    const readerHtml = await this.requestManager.fetchText(readerUrl, READER_CACHE_SECONDS);
    return parseChapterDetailsHtml(readerHtml, chapter, this);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [];

    if ((Application.getState("popular_section_enabled") as boolean) ?? true) {
      sections.push({
        id: "popular_section",
        title: "In tendenza",
        subtitle: "Capitoli più letti in questo momento",
        type: DiscoverSectionType.featured,
      });
    }
    if ((Application.getState("update_section_enabled") as boolean) ?? true) {
      sections.push({
        id: "updated_section",
        title: "Aggiornati di recente",
        subtitle: "Ultimi capitoli pubblicati",
        type: DiscoverSectionType.chapterUpdates,
      });
    }
    if ((Application.getState("mese_section_enabled") as boolean) ?? true) {
      sections.push({
        id: "mese_section",
        title: "Manga del mese",
        subtitle: "I più letti del mese su MangaWorld",
        type: DiscoverSectionType.prominentCarousel,
      });
    }
    if ((Application.getState("new_section_enabled") as boolean) ?? true) {
      sections.push({
        id: "new_manga_section",
        title: "Nuove aggiunte",
        subtitle: "Le serie aggiunte più di recente",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if ((Application.getState("most_read_section_enabled") as boolean) ?? true) {
      sections.push({
        id: "most_read_section",
        title: "Più letti",
        subtitle: "I titoli più popolari",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if (
      getFavoriteGenres().length > 0 &&
      ((Application.getState("fav_section_enabled") as boolean) ?? true)
    ) {
      sections.push({
        id: "new_fav_type_section",
        title: "Per te",
        subtitle: "Nuove aggiunte dei tuoi generi preferiti",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if ((Application.getState("type_section_enabled") as boolean) ?? true) {
      sections.push({
        id: "type_section",
        title: "Esplora per tipologia",
        subtitle: "Manga, manhwa, manhua e altro",
        type: DiscoverSectionType.genres,
      });
    }
    if ((Application.getState("genre_section_enabled") as boolean) ?? true) {
      sections.push({
        id: "genre_section",
        title: "Esplora per genere",
        subtitle: "Trova nuovi titoli per genere",
        type: DiscoverSectionType.genres,
      });
    }

    return sections;
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: MangaMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    switch (section.id) {
      case "popular_section":
      case "mese_section":
        return this.getHeroSection(section.id, metadata);
      case "updated_section":
        return this.getUpdatedSection(metadata);
      case "most_read_section":
        return this.getArchiveSection("most_read", metadata, false);
      case "new_manga_section":
        return this.getArchiveSection("newest", metadata, false);
      case "new_fav_type_section":
        return this.getArchiveSection("newest", metadata, true);
      case "type_section":
        return this.getTypeSection();
      case "genre_section":
        return this.getGenreSection();
      default:
        return { items: [] };
    }
  }

  private hiddenManga(genreSlugs: string[], type: string): boolean {
    return (
      tags.blacklistedTags(genreSlugs) ||
      genreSlugs.some((genre) => isMigratedAdultGenreHidden(genre)) ||
      (type.length > 0 && types.blacklistedType(type))
    );
  }

  private rating(genreNames: string[]): ContentRating {
    return this.defaultContentRating === ContentRating.ADULT
      ? ContentRating.ADULT
      : tags.getRating(genreNames);
  }

  private async getHeroSection(
    id: "popular_section" | "mese_section",
    metadata: MangaMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const html = await this.requestManager.fetchText(this.base_url, HOME_CACHE_SECONDS);
    try {
      const entries = jsonParser.getWindowEntry(html);
      const items: DiscoverSectionItem[] = [];

      if (id === "popular_section") {
        const trending = entries.find((entry) => entry.kind === "trending");
        for (const chapter of trending?.data.mostViewedChapters ?? []) {
          const genreSlugs = chapter.manga.genres?.map((genre) => genre.slug) ?? [];
          const genreNames = chapter.manga.genres?.map((genre) => genre.name) ?? [];
          if (this.hiddenManga(genreSlugs, chapter.manga.typeT ?? "")) continue;
          items.push({
            type: "featuredCarouselItem",
            mangaId: `${chapter.manga.linkId}/${chapter.manga.slug}`,
            imageUrl: chapter.manga.imageT || chapter.manga.image,
            title: chapter.manga.title ?? "",
            supertitle: chapter.name,
            contentRating: this.rating(genreNames),
          });
        }
      } else {
        const global = entries.find((entry) => entry.kind === "global");
        for (const manga of global?.data.globalData.topMangas ?? []) {
          const genreSlugs = manga.genres?.map((genre) => genre.slug) ?? [];
          const genreNames = manga.genres?.map((genre) => genre.name) ?? [];
          if (this.hiddenManga(genreSlugs, manga.typeT ?? "")) continue;
          items.push({
            type: "prominentCarouselItem",
            mangaId: `${manga.linkId}/${manga.slug}`,
            imageUrl: manga.imageT || manga.image,
            title: manga.title ?? "",
            subtitle: manga.typeT ?? "",
            contentRating: this.rating(genreNames),
          });
        }
      }

      if (items.length > 0) return { items, metadata };
    } catch {
      // Use the visible HTML cards below.
    }
    return parseHeroDiscoverHtml(html, this, id === "popular_section" ? "featured" : "prominent");
  }

  private async getUpdatedSection(
    metadata: MangaMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    try {
      return await this.parser.parseChapterUpdateSection(metadata ?? {}, this);
    } catch {
      const page = metadata?.page ?? 1;
      const url = page === 1 ? this.base_url : `${this.base_url}/?page=${page}`;
      const html = await this.requestManager.fetchText(url, page === 1 ? HOME_CACHE_SECONDS : 5);
      return parseSimpleDiscoverHtml(html, this, metadata);
    }
  }

  private async getArchiveSection(
    sort: "most_read" | "newest",
    metadata: MangaMetadata | undefined,
    favorites: boolean,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const html =
      sort === "most_read"
        ? await this.requestManager.parsePopularSectionRequests(page, this)
        : await this.requestManager.parseLastMangaAddedTagsSectionRequests(page, this, favorites);

    try {
      const entries = jsonParser.getWindowEntry(html);
      const cards = this.parser.parsePage(this, entries).filter(
        (item) => !this.hiddenManga(item.tags, item.type),
      );
      const items: DiscoverSectionItem[] = cards.map((item) => ({
        type: "simpleCarouselItem",
        mangaId: item.id,
        imageUrl: item.image,
        title: item.title,
        subtitle: item.authors || item.type,
        contentRating: this.rating(item.tags),
      }));
      const searchInfo = entries.find((entry) => entry.kind === "searchInfo");
      const hasMore = searchInfo ? page < searchInfo.data.totalPages : items.length > 0;
      return { items, metadata: hasMore ? { page: page + 1 } : undefined };
    } catch {
      return parseSimpleDiscoverHtml(html, this, metadata);
    }
  }

  private async getTypeSection(): Promise<PagedResults<DiscoverSectionItem>> {
    await filter.populateFilter(this);
    return {
      items: filter
        .getMangaTypeFilter()
        .filter((item) => !types.blacklistedType(item.id))
        .filter((item) => !isMigratedAdultGenreHidden(item.id))
        .map((item) => ({
          type: "genresCarouselItem" as const,
          name: item.value,
          searchQuery: {
            title: "",
            metadata: { types: { [item.id]: "included" as const } },
          },
          contentRating: ContentRating.EVERYONE,
        })),
    };
  }

  private async getGenreSection(): Promise<PagedResults<DiscoverSectionItem>> {
    await filter.populateFilter(this);
    return {
      items: filter
        .getGenreFilter()
        .filter((item) => !tags.blacklistedTags([item.id]))
        .filter(
          (item) =>
            !isMigratedAdultGenreHidden(item.id) && !isMigratedAdultGenreHidden(item.value),
        )
        .map((item) => ({
          type: "genresCarouselItem" as const,
          name: item.value,
          searchQuery: {
            title: "",
            metadata: { genres: { [item.id]: "included" as const } },
          },
          contentRating: this.rating([item.value]),
        })),
    };
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    await filter.populateFilter(this);
    return filter.getOrderFilter().map((item) => ({
      id: item.id,
      label: item.value,
    }));
  }
}
