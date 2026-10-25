import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type MangaInfo,
  type SourceManga,
  type Tag,
  type TagSection,
} from "@paperback/types";

import FansubGeneral from "./main";
import type { ComicDetailResponse } from "./models";

export class FansubGeneralParsers {
  private rating(adult: number): ContentRating {
    return adult === 1 ? ContentRating.ADULT : ContentRating.EVERYONE;
  }

  async parseMangaDetails(mangaId: string, source: FansubGeneral): Promise<SourceManga> {
    const jsonRequest = await source.requestManager.apiMangaDetails(mangaId);
    const json = JSON.parse(jsonRequest) as ComicDetailResponse;
    const comic = json.comic;
    const genres: Tag[] = comic.genres.map((tag) => ({ id: tag.slug, title: tag.name }));
    const tagSections: TagSection[] = [{ id: "genres", title: "Generi", tags: genres }];
    const info: MangaInfo = {
      thumbnailUrl: source.normalizeUrl(comic.thumbnail),
      synopsis: comic.description ?? "",
      primaryTitle: comic.title,
      secondaryTitles: comic.alt_titles,
      contentRating: this.rating(comic.adult),
      status: comic.status ?? "",
      artist: comic.artist ?? "",
      author: comic.author ?? "",
      rating: comic.rating / 10,
      tagGroups: tagSections,
      shareUrl: comic.url || undefined,
      additionalInfo: { Fonte: source.name, Lingua: "Italiano 🇮🇹" },
    };
    return { mangaId, mangaInfo: info };
  }

  async parseChapters(sourceManga: SourceManga, source: FansubGeneral): Promise<Chapter[]> {
    const jsonRequest = await source.requestManager.apiMangaDetails(sourceManga.mangaId);
    const json = JSON.parse(jsonRequest) as ComicDetailResponse;
    return json.comic.chapters.map((chapter) => ({
      chapterId: chapter.url,
      sourceManga,
      langCode: chapter.language || "it",
      chapNum: chapter.chapter ?? 0,
      title: chapter.title ?? chapter.full_title ?? "",
      version: chapter.teams[0]?.name ?? source.name,
      volume: chapter.volume ?? 0,
      publishDate: new Date(chapter.published_on),
    }));
  }

  async parseChapterDetails(chapter: Chapter, source: FansubGeneral): Promise<ChapterDetails> {
    const pages = source.normalizePages(
      await source.requestManager.getChapterPages(chapter.chapterId),
    );
    if (pages.length === 0) throw new Error("Nessuna pagina valida trovata per questo capitolo.");
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }
}
