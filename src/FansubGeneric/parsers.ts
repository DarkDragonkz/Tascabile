import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type DiscoverSection,
  type DiscoverSectionItem,
  type MangaInfo,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SourceManga,
  type Tag,
  type TagSection,
} from "@paperback/types";

import FansubGeneral from "./main";
import type { ComicDetailResponse, ComicListItem, ComicsListResponse } from "./models";
import type { FansubSearchMeta } from "./search";

function timestamp(value: string | undefined): number {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export class FansubGeneralParsers {
  private rating(adult: number): ContentRating {
    return adult === 1 ? ContentRating.ADULT : ContentRating.EVERYONE;
  }

  private async catalog(source: FansubGeneral): Promise<ComicListItem[]> {
    const raw = await source.requestManager.apiMangaDetails("", true);
    const json = JSON.parse(raw) as ComicsListResponse;
    return json.comics.filter((comic) => !source.shouldHideAdult(comic.adult));
  }

  async parseSearchResults(
    query: SearchQuery<Metadata>,
    source: FansubGeneral,
  ): Promise<PagedResults<SearchResultItem>> {
    const jsonRequest = await source.requestManager.apiSearchResult(query);
    const json = JSON.parse(jsonRequest) as ComicsListResponse;
    const searchMeta = (query.metadata as { searchMeta?: FansubSearchMeta } | undefined)?.searchMeta;
    const sort = searchMeta?.sort?.[0] ?? "recent";
    const comics = json.comics.filter((comic) => !source.shouldHideAdult(comic.adult));

    if (sort === "title_asc") comics.sort((a, b) => a.title.localeCompare(b.title, "it"));
    if (sort === "title_desc") comics.sort((a, b) => b.title.localeCompare(a.title, "it"));
    if (sort === "recent") {
      comics.sort(
        (a, b) => timestamp(b.last_chapter?.published_on) - timestamp(a.last_chapter?.published_on),
      );
    }

    return {
      items: comics.map((comic) => ({
        mangaId: comic.slug,
        title: comic.title,
        imageUrl: source.normalizeUrl(comic.thumbnail),
        subtitle: comic.author ?? "",
        contentRating: this.rating(comic.adult),
      })),
    };
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
      additionalInfo: { subs: source.name },
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

  async parseSectionHome(
    source: FansubGeneral,
    section: DiscoverSection,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const comics = await this.catalog(source);
    const recent = [...comics].sort(
      (a, b) => timestamp(b.last_chapter?.published_on) - timestamp(a.last_chapter?.published_on),
    );

    if (section.id === "featured") {
      return {
        items: recent.slice(0, 10).map((manga) => ({
          type: "featuredCarouselItem",
          mangaId: manga.slug,
          imageUrl: source.normalizeUrl(manga.thumbnail),
          title: manga.title,
          supertitle: manga.last_chapter?.title ?? manga.last_chapter?.full_title ?? "In evidenza",
          contentRating: this.rating(manga.adult),
        })),
      };
    }

    if (section.id === "recent") {
      return {
        items: recent.flatMap((manga) => {
          const chapter = manga.last_chapter;
          if (!chapter) return [];
          return [
            {
              type: "chapterUpdatesCarouselItem" as const,
              mangaId: manga.slug,
              chapterId: chapter.url,
              imageUrl: source.normalizeUrl(manga.thumbnail),
              title: manga.title,
              subtitle: chapter.title ?? chapter.full_title,
              publishDate: new Date(chapter.published_on),
              contentRating: this.rating(manga.adult),
            },
          ];
        }),
      };
    }

    const alphabetical = [...comics].sort((a, b) => a.title.localeCompare(b.title, "it"));
    return {
      items: alphabetical.map((manga) => ({
        type: "simpleCarouselItem",
        mangaId: manga.slug,
        imageUrl: source.normalizeUrl(manga.thumbnail),
        title: manga.title,
        subtitle: manga.author ?? "",
        contentRating: this.rating(manga.adult),
      })),
    };
  }

  async parseChapterDetails(chapter: Chapter, source: FansubGeneral): Promise<ChapterDetails> {
    const pages = source.normalizePages(await source.requestManager.getChapterPages(chapter.chapterId));
    if (pages.length === 0) throw new Error("Nessuna pagina valida trovata per questo capitolo.");
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }
}
