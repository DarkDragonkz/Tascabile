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

import { INFO_SYMBOLS, formatCountIt, infoItems, shortSummary } from "../common/discover";
import { MangaWorldGeneric, jsonParser } from "../generic/main";
import type { Manga, MangaMetadata } from "../generic/models";
import { HOME_CACHE_SECONDS } from "../generic/preferences";
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
    // Prefer the manga payload: MangaWorld exposes the complete page list there.
    // The generic implementation falls back to the reader page only when that
    // payload is unavailable. This avoids the progressive single-page reader
    // behaviour which can leave Paperback stuck while loading a chapter.
    const details = await super.getChapterDetails(chapter);
    if (!("pages" in details)) return details;

    const pages = this.normalizePages(details.pages);
    if (pages.length === 0) {
      throw new Error("MangaWorld: nessuna pagina valida trovata per questo capitolo.");
    }

    return {
      ...details,
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
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
      const global = entries.find((entry) => entry.kind === "global");
      // Same hidden-content rules as every other Home section.
      const visible = (manga: Manga) => this.homeContentRating(manga, entries);

      if (section.id === "popular_section") {
        const trending = entries.find((entry) => entry.kind === "trending");
        // The most viewed chapters often include runs of the same series (One Piece 28,
        // 29, 30…): show each series once, with the chapters it is trending for.
        const groups = new Map<string, { manga: Manga; chapters: string[] }>();
        for (const chapter of trending?.data.mostViewedChapters ?? []) {
          const mangaId = mangaIdOf(chapter.manga);
          if (!mangaId) continue;
          const group = groups.get(mangaId) ?? { manga: chapter.manga, chapters: [] };
          group.chapters.push(chapter.name);
          groups.set(mangaId, group);
        }
        for (const [mangaId, { manga, chapters }] of groups) {
          const imageUrl = this.normalizeUrl(manga.imageT || manga.image);
          const title = manga.title?.trim() ?? "";
          const contentRating = visible(manga);
          if (!imageUrl || !title || !contentRating) continue;
          items.push({
            type: "featuredCarouselItem",
            mangaId,
            imageUrl,
            title,
            supertitle: trendingChapters(chapters),
            summary: shortSummary(manga.trama),
            infoItems: infoItems(
              { symbol: INFO_SYMBOLS.type, text: manga.typeT },
              { symbol: INFO_SYMBOLS.status, text: manga.statusT },
            ),
            contentRating,
          });
        }
      } else {
        for (const manga of global?.data.globalData.topMangas ?? []) {
          const imageUrl = this.normalizeUrl(manga.imageT || manga.image);
          const mangaId = mangaIdOf(manga);
          const title = manga.title?.trim() ?? "";
          const contentRating = visible(manga);
          if (!imageUrl || !mangaId || !title || !contentRating) continue;
          const reads = manga.monthViews ? `${formatCountIt(manga.monthViews)} letture` : "";
          items.push({
            type: "prominentCarouselItem",
            mangaId,
            imageUrl,
            title,
            subtitle: [manga.typeT, reads].filter(Boolean).join(" · "),
            contentRating,
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
        pages.map((page) => this.normalizeUrl(page)).filter((page): page is string => !!page),
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

/** `<linkId>/<slug>`, the ID used by details and library entries; undefined if incomplete. */
function mangaIdOf(manga: Manga): string | undefined {
  const id = `${manga.linkId ?? ""}/${manga.slug ?? ""}`.replace(/^\/+|\/+$/gu, "");
  return id.includes("/") ? id : undefined;
}

/** "Capitolo 31"; a run of chapters reads "Capitoli 28–32"; others "Capitolo 5 e altri 2". */
export function trendingChapters(names: string[]): string {
  const [first = ""] = names;
  if (names.length < 2) return first;
  const numbers = names.map((name) => Number(name.match(/\d+(?:\.\d+)?/u)?.[0]));
  if (numbers.every(Number.isFinite)) {
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    if (max - min === names.length - 1) return `Capitoli ${min}–${max}`;
  }
  return `${first} e altri ${names.length - 1}`;
}

export const MangaWorld = new MangaWorldExtension();
