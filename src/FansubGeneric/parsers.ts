import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type DiscoverSection,
  type DiscoverSectionItem,
  type JSONValue,
  type MangaInfo,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SourceManga,
  type Tag,
  type TagSection,
} from "@paperback/types";

import FansubGeneral from "./main";
import type { ComicDetailResponse, ComicListItem, ComicsListResponse } from "./models";

export class FansubGeneralParsers {
  async parseSearchResults(
    query: SearchQuery<JSONValue>,
    source: FansubGeneral,
  ): Promise<PagedResults<SearchResultItem>> {
    const jsonRequest = await source.requestManager.apiSearchResult(query);
    const json = JSON.parse(jsonRequest) as ComicsListResponse;
    const mangas: SearchResultItem[] = [];
    json.comics.forEach((comic: ComicListItem) => {
      mangas.push({
        mangaId: comic.slug,
        title: comic.title,
        imageUrl: comic.thumbnail,
        contentRating: comic.adult === 1 ? ContentRating.ADULT : ContentRating.EVERYONE,
      });
    });
    return { items: mangas };
  }

  async parseMangaDetails(mangaId: string, source: FansubGeneral): Promise<SourceManga> {
    const jsonRequest = await source.requestManager.apiMangaDetails(mangaId);
    const json = JSON.parse(jsonRequest) as ComicDetailResponse;
    const comic = json.comic;
    const genres: Tag[] = comic.genres.map((tag) => ({ id: tag.slug, title: tag.name }));
    const tagSections: TagSection[] = [{ id: "genres", title: "Generi", tags: genres }];
    const info: MangaInfo = {
      thumbnailUrl: comic.thumbnail,
      synopsis: comic.description ?? "",
      primaryTitle: comic.title,
      secondaryTitles: comic.alt_titles,
      contentRating: comic.adult === 1 ? ContentRating.ADULT : ContentRating.EVERYONE,
      status: comic.status ?? "",
      artist: comic.artist ?? "",
      author: comic.author ?? "",
      rating: comic.rating / 10,
      tagGroups: tagSections,
    };
    return { mangaId, mangaInfo: info };
  }

  async parseChapters(sourceManga: SourceManga, source: FansubGeneral): Promise<Chapter[]> {
    const jsonRequest = await source.requestManager.apiMangaDetails(sourceManga.mangaId);
    const json = JSON.parse(jsonRequest) as ComicDetailResponse;
    const subs = sourceManga.mangaInfo.additionalInfo?.subs;
    return json.comic.chapters.map((chapter) => ({
      chapterId: chapter.url,
      sourceManga,
      langCode: chapter.language || "it",
      chapNum: chapter.chapter ?? 0,
      title: chapter.title ?? chapter.full_title ?? "",
      version: chapter.teams[0]?.name ?? (typeof subs === "string" ? subs : ""),
      volume: chapter.volume ?? 0,
      publishDate: new Date(chapter.published_on),
    }));
  }

  async parseSectionHome(
    source: FansubGeneral,
    _section: DiscoverSection,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const jsonRequest = await source.requestManager.apiMangaDetails("", true);
    const json = JSON.parse(jsonRequest) as ComicsListResponse;
    const items: DiscoverSectionItem[] = json.comics.map((manga) => ({
      type: "chapterUpdatesCarouselItem",
      mangaId: manga.slug,
      chapterId: manga.last_chapter.url,
      imageUrl: manga.thumbnail,
      title: manga.title,
      subtitle: manga.last_chapter.title ?? manga.last_chapter.full_title,
      publishDate: new Date(manga.last_chapter.published_on),
      contentRating: manga.adult === 1 ? ContentRating.ADULT : ContentRating.EVERYONE,
    }));
    return { items };
  }

  async parseChapterDetails(chapter: Chapter, source: FansubGeneral): Promise<ChapterDetails> {
    const pages = await source.requestManager.getChapterPages(chapter.chapterId);
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }
}
