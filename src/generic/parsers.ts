/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type ChapterUpdatesCarouselItem,
  type DiscoverSectionItem,
  type SourceManga,
  type TagSection,
} from "@paperback/types";

import { detailInfo, formatCountIt } from "../common/discover";
import type { MangaWorldGeneric } from "./main";
import type { MangaChapterList, MangaMetadata, WindowEntry } from "./models";
import { HOME_CACHE_SECONDS } from "./preferences";
import { jsonParser, tags } from "./utils";

export class Parsers {
  private normalizeCoverUrl(source: MangaWorldGeneric, imageT?: string, image?: string): string {
    const rawUrl = imageT && imageT.trim().length > 0 ? imageT : (image ?? "");
    const trimmedUrl = rawUrl.trim();
    if (trimmedUrl.length === 0) return "";
    if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) return trimmedUrl;
    if (trimmedUrl.startsWith("//")) return `https:${trimmedUrl}`;

    const baseUrl = source.base_url.replace(/\/+$/u, "");
    const path = trimmedUrl.replace(/^\/+/, "");
    return `${baseUrl}/${path}`;
  }

  parseMangaDetails(
    mangaInfo: WindowEntry[],
    mangaId: string,
    shareURL: string,
    source: MangaWorldGeneric,
  ): SourceManga {
    const entry = mangaInfo.find((item) => item.kind === "manga");
    if (!entry) {
      throw new Error("Nessun dato manga trovato nel JSON");
    }

    const parsed = entry.data.manga;
    const tagsArray = jsonParser.mapGenresToTags(parsed.genres);
    const rating =
      source.defaultContentRating === ContentRating.ADULT || parsed.vm18
        ? ContentRating.ADULT
        : tags.getRating(parsed.genres?.map((genre) => genre.name) ?? []);

    const tagSections: TagSection[] = [{ id: "genres", title: "Generi", tags: tagsArray }];
    return {
      mangaId,
      mangaInfo: {
        artist: parsed.artist.join(", "),
        thumbnailUrl: this.normalizeCoverUrl(source, parsed.imageT, parsed.image),
        synopsis: parsed.trama,
        primaryTitle: parsed.title ?? "",
        contentRating: rating,
        status: parsed.statusT,
        author: parsed.author.join(", "),
        tagGroups: tagSections,
        secondaryTitles: parsed.extraTitles ?? [],
        additionalInfo: detailInfo({
          Fansub: parsed.fansub?.name ?? "Ufficiale",
          Tipologia: parsed.typeT,
          Anno: parsed.year ? String(parsed.year) : undefined,
          Visualizzazioni: parsed.totViews ? formatCountIt(parsed.totViews) : undefined,
          "Su MangaWorld dal": parsed.createdAtT,
          Lingua: "Italiano 🇮🇹",
        }),
        shareUrl: shareURL,
      },
    };
  }

  baseChapterData(chapter: MangaChapterList, sourceManga: SourceManga) {
    return {
      chapterId: chapter.id,
      sourceManga,
      langCode: "it",
      chapNum: firstNumber(chapter.name) ?? 0,
      // Paperback shows the number already: "Capitolo 356" alone is not a title.
      title:
        chapter.title?.trim() ||
        (/^capitolo\s*\d+(?:[.,]\d+)?$/iu.test(chapter.name ?? "") ? "" : (chapter.name ?? "")),
      // `subs` is the pre-1.0.0-alpha.37 key, still present in saved library entries.
      version:
        sourceManga.mangaInfo.additionalInfo?.Fansub ??
        sourceManga.mangaInfo.additionalInfo?.subs ??
        "",
      publishDate: new Date(chapter.createdAt),
    };
  }

  parseChapters(items: WindowEntry[], sourceManga: SourceManga): Chapter[] {
    return items
      .filter((item) => item.kind === "chapter")
      .flatMap((item) => {
        const elements = item.data.pages;
        const volumeChapters = (elements.volumes ?? []).flatMap((volume) =>
          volume.chapters.map((chapter) => ({
            ...this.baseChapterData(chapter, sourceManga),
            volume: firstNumber(volume.volume.name),
            additionalInfo: {
              icon: volume.volume.imageT ?? "",
              name: volume.volume.name ?? "",
            },
          })),
        );
        const singleChapters = (elements.singleChapters ?? []).map((chapter) =>
          this.baseChapterData(chapter, sourceManga),
        );
        return [...volumeChapters, ...singleChapters];
      });
  }

  parseChapterDetails(json: WindowEntry[], chapterId: string): ChapterDetails {
    const mangaEntry = json.find((entry) => entry.kind === "manga");
    const chapterEntry = json.find((entry) => entry.kind === "chapter");
    if (!mangaEntry || !chapterEntry) {
      throw new Error("Manga o capitolo non trovati nel JSON");
    }

    const { slugFolder: slug, id: mangaID } = mangaEntry.data.manga;
    const { CDN_URL: cdnUrl, pages: pageData } = chapterEntry.data;
    const info = jsonParser.findChapterData(pageData, chapterId);
    const pages =
      info?.pages.map(
        (page) => `${cdnUrl}/chapters/${slug}-${info.mangaId}/${info.chapterURL}/${page}`,
      ) ?? [];

    return {
      id: chapterId,
      mangaId: mangaID,
      pages,
    };
  }

  /** Archive and search cards; `adult` is MangaWorld's own 18+ flag. */
  parsePage(
    source: MangaWorldGeneric,
    json: WindowEntry[],
  ): {
    id: string;
    title: string;
    image: string;
    tags: string[];
    authors: string;
    type: string;
    adult: boolean;
  }[] {
    return json
      .filter((entry) => entry.kind === "search")
      .flatMap((entry) =>
        entry.data.mangas.map((manga) => ({
          id: `${manga.linkId}/${manga.slug}`,
          title: manga.title ?? "",
          image: this.normalizeCoverUrl(source, manga.imageT, manga.image),
          tags: manga.genres?.map((genre) => genre.slug) ?? [],
          authors: manga.author?.join(", ") ?? "",
          type: manga.typeT ?? "",
          adult: manga.vm18 === true,
        })),
      );
  }

  async parseChapterUpdateSection(
    metadata: MangaMetadata,
    source: MangaWorldGeneric,
  ): Promise<{ items: DiscoverSectionItem[]; metadata: MangaMetadata | undefined }> {
    const page = metadata?.page ?? 1;
    // Page 1 is the Home itself, already cached for "In tendenza" and "Più letti del mese".
    const html =
      page === 1
        ? await source.requestManager.fetchText(source.base_url, HOME_CACHE_SECONDS)
        : await source.requestManager.fetchText(`${source.base_url}/?page=${page}`, 60);
    const updates: ChapterUpdatesCarouselItem[] = [];

    const windowEntry = jsonParser.getWindowEntry(html);
    for (const { kind, data } of windowEntry) {
      if (kind !== "manga") continue;
      const { manga, chapters } = data;
      const firstChapter = chapters?.[0];
      // Hidden genres/types and adult ratings apply here like in every other section.
      const contentRating = source.homeContentRating(manga, windowEntry);
      if (firstChapter && contentRating) {
        updates.push({
          chapterId: firstChapter.id ?? "",
          type: "chapterUpdatesCarouselItem",
          publishDate: new Date(firstChapter.createdAt),
          contentRating,
          imageUrl: this.normalizeCoverUrl(source, manga.imageT, manga.image),
          mangaId: `${manga.linkId}/${manga.slug}`,
          title: manga.title ?? "",
          subtitle: firstChapter.name ?? "",
        });
      }
    }

    // A page without manga entries is past the end: stop instead of paging forever.
    const hasManga = windowEntry.some((entry) => entry.kind === "manga");
    return { items: updates, metadata: hasManga ? { page: page + 1 } : undefined };
  }
}

/** "Capitolo 28.5" → 28.5, "Volume 03" → 3; undefined for names without a number ("Oneshot"). */
function firstNumber(name: string | undefined): number | undefined {
  const parsed = Number.parseFloat(name?.match(/\d+(?:[.,]\d+)?/u)?.[0]?.replace(",", ".") ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}
