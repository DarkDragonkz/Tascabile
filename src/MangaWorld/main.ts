/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import {
  type Chapter,
  type ChapterDetails,
  type DiscoverSection,
  type DiscoverSectionItem,
  type PagedResults,
} from "@paperback/types";

import { parseChapterDetailsHtml } from "../generic/htmlFallbacks";
import { MangaWorldGeneric, jsonParser } from "../generic/main";
import type { MangaMetadata } from "../generic/models";
import { HOME_CACHE_SECONDS, READER_CACHE_SECONDS } from "../generic/preferences";
import pbconfig from "./pbconfig";

const DOMAIN = "https://www.mangaworld.mx";
const CDN_DOMAIN = "https://cdn.mangaworld.mx";

class MangaWorldExtension extends MangaWorldGeneric {
  constructor() {
    super({
      domain: DOMAIN,
      name: pbconfig.name,
      contentRating: pbconfig.contentRating,
    });
  }

  override async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaUrl = `${DOMAIN}/manga/${chapter.sourceManga.mangaId}`;
    const readerUrl = `${mangaUrl}/read/${chapter.chapterId}`;
    const readerHtml = await this.requestManager.fetchText(readerUrl, READER_CACHE_SECONDS);

    try {
      const details = this.parser.parseChapterDetails(
        jsonParser.getWindowEntry(readerHtml),
        chapter.chapterId,
      );
      if ("pages" in details) {
        const pages = this.normalizePages(details.pages);
        if (pages.length > 0) {
          return {
            id: chapter.chapterId,
            mangaId: chapter.sourceManga.mangaId,
            pages,
          };
        }
      }
    } catch {
      // The current reader page may omit the embedded JSON. Parse visible CDN images instead.
    }

    const fallback = parseChapterDetailsHtml(readerHtml, chapter, this);
    if ("pages" in fallback) {
      const pages = this.normalizePages(fallback.pages);
      if (pages.length > 0) {
        return {
          id: chapter.chapterId,
          mangaId: chapter.sourceManga.mangaId,
          pages,
        };
      }
    }

    throw new Error("MangaWorld: nessuna pagina valida trovata per questo capitolo.");
  }

  override async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: MangaMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (section.id !== "popular_section" && section.id !== "mese_section") {
      return super.getDiscoverSectionItems(section, metadata);
    }

    const html = await this.requestManager.fetchText(DOMAIN, HOME_CACHE_SECONDS);
    try {
      const entries = jsonParser.getWindowEntry(html);
      const items: DiscoverSectionItem[] = [];

      if (section.id === "popular_section") {
        const trending = entries.find((entry) => entry.kind === "trending");
        for (const chapter of trending?.data.mostViewedChapters ?? []) {
          const manga = chapter.manga;
          const imageUrl = this.normalizeUrl(manga.imageT || manga.image);
          const mangaId = `${manga.linkId ?? ""}/${manga.slug ?? ""}`.replace(/^\/+|\/+$/gu, "");
          const title = manga.title?.trim() ?? "";
          if (!imageUrl || !mangaId.includes("/") || !title) continue;
          items.push({
            type: "featuredCarouselItem",
            mangaId,
            imageUrl,
            title,
            supertitle: chapter.name,
            contentRating: pbconfig.contentRating,
          });
        }
      } else {
        const global = entries.find((entry) => entry.kind === "global");
        for (const manga of global?.data.globalData.topMangas ?? []) {
          const imageUrl = this.normalizeUrl(manga.imageT || manga.image);
          const mangaId = `${manga.linkId ?? ""}/${manga.slug ?? ""}`.replace(/^\/+|\/+$/gu, "");
          const title = manga.title?.trim() ?? "";
          if (!imageUrl || !mangaId.includes("/") || !title) continue;
          items.push({
            type: "prominentCarouselItem",
            mangaId,
            imageUrl,
            title,
            subtitle: manga.typeT ?? "",
            contentRating: pbconfig.contentRating,
          });
        }
      }

      if (items.length > 0) return { items, metadata };
    } catch {
      // Delegate to the generic HTML fallback below.
    }

    const fallback = await super.getDiscoverSectionItems(section, metadata);
    return {
      ...fallback,
      items: fallback.items.flatMap((item) => {
        if (!("imageUrl" in item)) return [item];
        const imageUrl = this.normalizeUrl(item.imageUrl);
        return imageUrl ? [{ ...item, imageUrl } as DiscoverSectionItem] : [];
      }),
    };
  }

  private normalizePages(pages: string[]): string[] {
    return [
      ...new Set(
        pages
          .map((page) => this.normalizeUrl(page))
          .filter((page): page is string => !!page),
      ),
    ];
  }

  private normalizeUrl(rawUrl: string | undefined): string | undefined {
    const value = rawUrl?.trim().replace(/\\\//gu, "/") ?? "";
    if (!value) return undefined;
    if (/^https:\/\//iu.test(value)) return value;
    if (/^http:\/\//iu.test(value)) return value.replace(/^http:/iu, "https:");
    if (value.startsWith("//")) return `https:${value}`;
    if (/^(?:(?:www|cdn)\.)?mangaworld\.(?:mx|in)\//iu.test(value)) {
      return `https://${value}`;
    }
    if (value.startsWith("/chapters/")) return `${CDN_DOMAIN}${value}`;
    if (value.startsWith("/")) return `${DOMAIN}${value}`;
    return `${DOMAIN}/${value.replace(/^\/+/, "")}`;
  }
}

export const MangaWorld = new MangaWorldExtension();
