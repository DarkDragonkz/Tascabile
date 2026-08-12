/* SPDX-License-Identifier: MIT */

import {
  ContentRating,
  DiscoverSectionType,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SourceManga,
} from "@paperback/types";
import * as cheerio from "cheerio";

const BASE_URL = "https://mkissa.to";

function absoluteUrl(value: string): string {
  if (!value) return "";
  if (/^https?:\/\//u.test(value)) return value;
  return `${BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

function parseCatalog(html: string): SearchResultItem[] {
  const $ = cheerio.load(html);
  const results: SearchResultItem[] = [];
  const seen = new Set<string>();

  $('a[href^="/manga/"]').each((_, element) => {
    const link = $(element);
    const href = link.attr("href") ?? "";
    const mangaId = href.split("/manga/")[1]?.split(/[?#]/u)[0]?.replace(/\/$/u, "");
    if (!mangaId || seen.has(mangaId)) return;

    const container = link.closest("article, li, div");
    const image = container.find("img").first();
    const title =
      container.find("h2, h3, h4, [data-title]").first().text().trim() ||
      link.attr("title")?.trim() ||
      image.attr("alt")?.trim() ||
      link.text().trim();
    if (!title) return;

    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      imageUrl: absoluteUrl(
        image.attr("data-src") ?? image.attr("data-lazy-src") ?? image.attr("src") ?? "",
      ),
      contentRating: ContentRating.EVERYONE,
    });
  });

  return results;
}

class MKissaExtension
  implements Extension, MangaProviding, SearchResultsProviding, DiscoverSectionProviding
{
  async initialise(): Promise<void> {}

  private async fetchText(url: string): Promise<string> {
    const [, data] = await Application.scheduleRequest({
      url,
      method: "GET",
      headers: { "user-agent": await Application.getDefaultUserAgent() },
    });
    return Application.arrayBufferToUTF8String(data);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "browse",
        title: "Manga",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    _section: DiscoverSection,
    _metadata: undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const items = parseCatalog(await this.fetchText(`${BASE_URL}/manga`)).map(
      (item): DiscoverSectionItem => ({
        type: "simpleCarouselItem",
        mangaId: item.mangaId,
        title: item.title,
        imageUrl: item.imageUrl,
        contentRating: item.contentRating,
      }),
    );
    return { items };
  }

  async getSearchResults(
    query: SearchQuery,
    _metadata: undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const items = parseCatalog(await this.fetchText(`${BASE_URL}/manga`));
    const needle = query.title.toString().trim().toLocaleLowerCase();
    return {
      items: needle ? items.filter((item) => item.title.toLocaleLowerCase().includes(needle)) : items,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const shareUrl = `${BASE_URL}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.fetchText(shareUrl);
    const $ = cheerio.load(html);
    const title =
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      mangaId;
    const thumbnailUrl = absoluteUrl(
      $('meta[property="og:image"]').attr("content") ?? $("main img").first().attr("src") ?? "",
    );
    const synopsis =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "MKissa is a discovery catalog and does not host manga chapters.";

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        thumbnailUrl,
        synopsis,
        author: "",
        artist: "",
        status: "Unknown",
        contentRating: ContentRating.EVERYONE,
        tagGroups: [],
        shareUrl,
      },
    };
  }
}

export const MKissa = new MKissaExtension();
