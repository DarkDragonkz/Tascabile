/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { ContentRating, type Tag } from "@paperback/types";
import * as cheerio from "cheerio";

import type { MangaWorldGeneric } from "./main";
import type {
  ChapterList,
  Genre,
  GlobalData,
  JSONConfig,
  JsonData,
  MangaPageData,
  OptionItem,
  Pages,
  RawEntry,
  SearchInfo,
  SearchResults,
  TrendingChaptersData,
  WindowEntry,
} from "./models";

export class Tags {
  tagRatingMap: Record<string, ContentRating> = {
    ADULTI: ContentRating.ADULT,
    MATURO: ContentRating.MATURE,
  };

  public excludedTags = (tags: string[], excluded: string[]): boolean => {
    return tags.some((tag) => excluded.includes(tag));
  };

  public blacklistedTags = (tags: string[]): boolean => {
    const blacklistedSettings = (Application.getState("hide_tags") as string[] | undefined) ?? [];
    return tags.some((tag) => blacklistedSettings.includes(tag));
  };

  getRating(tags: string[]): ContentRating {
    for (const tag of tags) {
      const matchedRating = this.tagRatingMap[tag.toUpperCase()] ?? undefined;
      if (matchedRating) return matchedRating;
    }
    return ContentRating.EVERYONE;
  }
}

export class Type {
  public excludedTypes = (type: string, excluded: string[]): boolean => {
    return excluded.includes(type.toLowerCase());
  };

  public blacklistedType = (type: string): boolean => {
    const blacklistedSettings = (Application.getState("hide_type") as string[] | undefined) ?? [];
    return blacklistedSettings.includes(type.toLowerCase());
  };
}

export class FilterPreferences {
  private yearFilter: OptionItem[] = [];
  private genreFilter: OptionItem[] = [];
  private mangaTypeFilter: OptionItem[] = [];
  private orderFilter: OptionItem[] = [];
  private statusFilter: OptionItem[] = [];

  public getMangaTypeFilter(): OptionItem[] {
    return this.mangaTypeFilter;
  }

  public getOrderFilter(): OptionItem[] {
    return this.orderFilter;
  }

  public getStatusFilter(): OptionItem[] {
    return this.statusFilter;
  }

  public getGenreFilter(): OptionItem[] {
    return this.genreFilter;
  }

  public getYearFilter(): OptionItem[] {
    return this.yearFilter;
  }

  async populateFilter(source: MangaWorldGeneric, force = false): Promise<void> {
    const lastFilterFetch = Number(Application.getState("last-filter-fetch") ?? 0);
    const cached = lastFilterFetch + 604800 > new Date().valueOf() / 1000;

    if (cached && !force) {
      const genres = Application.getState(".genres") as string | undefined;
      const type = Application.getState(".type") as string | undefined;
      const status = Application.getState(".status") as string | undefined;
      const sort = Application.getState(".sort") as string | undefined;
      const year = Application.getState(".year") as string | undefined;

      if (genres && type && status && sort && year) {
        this.genreFilter = JSON.parse(genres) as OptionItem[];
        this.mangaTypeFilter = JSON.parse(type) as OptionItem[];
        this.statusFilter = JSON.parse(status) as OptionItem[];
        this.orderFilter = JSON.parse(sort) as OptionItem[];
        this.yearFilter = JSON.parse(year) as OptionItem[];
        return;
      }
    }

    const html = await source.requestManager.parseFilters(source);
    const windowEntry = jsonParser.getWindowEntry(html);
    const JSONFilter = this.extractOptionJSON(windowEntry);
    const $ = cheerio.load(html);

    this.mangaTypeFilter = this.extractOptions($, ".type");
    this.statusFilter = this.extractOptions($, ".status");
    this.orderFilter = this.extractOptions($, ".sort");
    this.genreFilter = JSONFilter.genres;
    this.yearFilter = JSONFilter.year;

    Application.setState(JSON.stringify(this.genreFilter), ".genres");
    Application.setState(JSON.stringify(this.mangaTypeFilter), ".type");
    Application.setState(JSON.stringify(this.statusFilter), ".status");
    Application.setState(JSON.stringify(this.orderFilter), ".sort");
    Application.setState(JSON.stringify(this.yearFilter), ".year");
    Application.setState(String(new Date().valueOf() / 1000), "last-filter-fetch");
  }

  extractOptions($: cheerio.CheerioAPI, filterSelector: string): OptionItem[] {
    const options = $(`${filterSelector} select.filter-select option`);
    const result: OptionItem[] = [];

    options.each((_, element) => {
      const id = $(element).attr("data-name");
      const label = $(element).text().trim();
      if (id && label) result.push({ id, value: label });
    });

    return result;
  }

  extractOptionJSON(windowEntry: WindowEntry[]): { genres: OptionItem[]; year: OptionItem[] } {
    for (const entry of windowEntry) {
      if (entry.kind === "global") {
        return {
          genres: this.mapGenresToOptionItem(entry.data.globalData.genres),
          year: this.mapStringToOptionItem([]),
        };
      }

      if (entry.kind === "search") {
        return {
          genres: [],
          year: this.mapStringToOptionItem(entry.data.years),
        };
      }
    }

    return { genres: [], year: [] };
  }

  mapGenresToOptionItem(genres?: Genre[] | null): OptionItem[] {
    if (!genres) return [];
    return genres.map((genre) => ({ id: genre.slug, value: genre.name }));
  }

  mapStringToOptionItem(tags: (string | number)[]): OptionItem[] {
    return tags.map((tag) => {
      const value = String(tag);
      return { id: value, value };
    });
  }
}

export class JsonParser {
  isMangaData(data: object): data is MangaPageData {
    return "manga" in data;
  }

  isGlobalData(data: object): data is { globalData: GlobalData } {
    return "globalData" in data;
  }

  isMangaChapterData(data: object): data is ChapterList {
    return "CDN_URL" in data;
  }

  isTrendingData(data: object): data is TrendingChaptersData {
    return "mostViewedChapters" in data;
  }

  isSearchData(data: object): data is SearchResults {
    return "selected" in data;
  }

  isSearchInfoData(data: object): data is SearchInfo {
    return "totalPages" in data;
  }

  convertEntries(w: (RawEntry | WindowEntry)[]): WindowEntry[] {
    return w.map((entry): WindowEntry => {
      if (!Array.isArray(entry)) return entry;

      const [key, index, data, meta] = entry;
      if (typeof data === "object" && data !== null) {
        if (this.isMangaData(data)) return { kind: "manga", key, index, data, meta };
        if (this.isGlobalData(data)) return { kind: "global", key, index, data, meta };
        if (this.isTrendingData(data)) return { kind: "trending", key, index, data, meta };
        if (this.isMangaChapterData(data)) return { kind: "chapter", key, index, data, meta };
        if (this.isSearchData(data)) return { kind: "search", key, index, data, meta };
        if (this.isSearchInfoData(data)) return { kind: "searchInfo", key, index, data, meta };
      }
      return {
        kind: "config",
        key,
        index,
        data: data as JSONConfig,
        meta,
      };
    });
  }

  getWindowEntry(html: string): WindowEntry[] {
    const regex =
      /<script[^>]*>\s*[^<]*?\$MC\s*=\s*\(window\.\$MC\|\|\[\]\)\.concat\(([\s\S]*?)\)\s*<\/script>/i;

    const match = html.match(regex);

    if (!match?.[1]) {
      throw new Error("No JSON Found");
    }
    const jsonText = match[1].trim();
    const json = JSON.parse(jsonText) as JsonData;
    return this.convertEntries(json.o.w);
  }

  mapGenresToTags(genres: Genre[]): Tag[] {
    return genres.map((genre) => ({
      id: genre.slug,
      title: genre.name,
    }));
  }

  findChapterData(page: Pages, chapterId: string) {
    if (page.volumes.length > 0) {
      for (const volume of page.volumes) {
        const chapter = volume.chapters.find((candidate) => candidate.id === chapterId);
        if (chapter) {
          return {
            chapterURL: `${volume.volume.slugFolder}-${volume.volume.id}/${chapter.slugFolder}-${chapter.id}`,
            mangaId: volume.volume.manga,
            pages: chapter.pages,
          };
        }
      }
    } else {
      const chapter = page.singleChapters.find((candidate) => candidate.id === chapterId);
      if (chapter) {
        return {
          chapterURL: `${chapter.slugFolder}-${chapter.id}`,
          mangaId: chapter.manga,
          pages: chapter.pages,
        };
      }
    }
    return null;
  }
}

export const filter = new FilterPreferences();
export const tags = new Tags();
export const types = new Type();
export const jsonParser = new JsonParser();
