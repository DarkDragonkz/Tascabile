/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import {
  PaperbackInterceptor,
  URL,
  type Request,
  type Response,
  type SearchQuery,
  type SortingOption,
} from "@paperback/types";

import { RequestCache } from "../common/requestCache";
import type { MangaWorldGeneric } from "./main";
import type { MangaWorldSearchMetadata } from "./models";
import { ARCHIVE_CACHE_SECONDS, getFavoriteGenres } from "./preferences";

export class Requests {
  private readonly cache = new RequestCache<ArrayBuffer>();

  constructSearchRequestURL(
    page: number,
    query: SearchQuery<MangaWorldSearchMetadata> = { title: "", metadata: {} },
    sorting: SortingOption | undefined,
    source: MangaWorldGeneric,
  ): {
    url: string;
    excluded: { generi: string[]; tipi: string[] };
  } {
    const metadata = query.metadata ?? {};
    const genres = metadata.genres ?? {};
    const mangaTypes = metadata.types ?? {};
    const includedGenres: string[] = [];
    const excludedGenres: string[] = [];
    const includedTypes: string[] = [];
    const excludedTypes: string[] = [];

    for (const [id, state] of Object.entries(genres)) {
      if (state === "included") includedGenres.push(id);
      if (state === "excluded") excludedGenres.push(id);
    }

    for (const [id, state] of Object.entries(mangaTypes)) {
      if (state === "included") includedTypes.push(id);
      if (state === "excluded") excludedTypes.push(id);
    }

    const url = new URL(source.base_url).addPathComponent("archive");
    const title = query.title.toString().trim();
    if (title.length > 0) url.setQueryItem("keyword", title);
    url.setQueryItem("page", page.toString());
    if (sorting?.id) url.setQueryItem("sort", sorting.id);
    if (includedGenres.length > 0) url.setQueryItem("genre", includedGenres);
    if (includedTypes.length > 0) url.setQueryItem("type", includedTypes);
    if (metadata.status) url.setQueryItem("status", metadata.status);
    if (metadata.year) url.setQueryItem("year", metadata.year);

    return {
      url: url.toString(),
      excluded: { generi: excludedGenres, tipi: excludedTypes },
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  async parseFilters(source: MangaWorldGeneric): Promise<string> {
    return this.fetchText(`${source.base_url}/archive`, ARCHIVE_CACHE_SECONDS);
  }

  async parseLastMangaAddedTagsSectionRequests(
    page: number,
    source: MangaWorldGeneric,
    favTags: boolean,
  ): Promise<string> {
    const url = new URL(source.base_url).addPathComponent("archive");
    url.setQueryItem("sort", "newest");
    url.setQueryItem("page", page.toString());
    if (favTags) {
      const favoriteGenres = getFavoriteGenres();
      if (favoriteGenres.length > 0) url.setQueryItem("genre", favoriteGenres);
    }
    return this.fetchText(url.toString(), ARCHIVE_CACHE_SECONDS);
  }

  async parsePopularSectionRequests(page: number, source: MangaWorldGeneric): Promise<string> {
    const url = new URL(source.base_url).addPathComponent("archive");
    url.setQueryItem("sort", "most_read");
    url.setQueryItem("page", page.toString());
    return this.fetchText(url.toString(), ARCHIVE_CACHE_SECONDS);
  }

  async getSearchResultsRequests(url: string): Promise<string> {
    return this.fetchText(url, 2);
  }

  async fetchText(url: string, cacheSeconds = 0): Promise<string> {
    return Application.arrayBufferToUTF8String(await this.fetchPage(url, cacheSeconds));
  }

  async fetchPage(url: string, cacheSeconds = 0): Promise<ArrayBuffer> {
    return this.cache.get(url, cacheSeconds, async () => {
      const [response, data] = await Application.scheduleRequest({
        url,
        method: "GET",
      });
      if (response.status >= 400) {
        throw new Error(`MangaWorld HTTP ${response.status}: ${url}`);
      }
      return data;
    });
  }
}

export class MainInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    const isMangaWorldCdn =
      request.url.includes("cdn.mangaworld.mx") || request.url.includes("cdn.mangaworld.in");

    if (isMangaWorldCdn) {
      request.headers = {
        ...request.headers,
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Origin: "https://www.mangaworld.mx",
        Referer: "https://www.mangaworld.mx/",
        "User-Agent": await Application.getDefaultUserAgent(),
      };
      return request;
    }

    if (request.url.includes("mangaworld.mx")) {
      request.headers = {
        ...request.headers,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.7",
        Referer: "https://www.mangaworld.mx/",
        "User-Agent": await Application.getDefaultUserAgent(),
      };
    }

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
