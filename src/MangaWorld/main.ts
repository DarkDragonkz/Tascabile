import {
  BasicRateLimiter,
  DiscoverSectionType,
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
  type SourceManga,
} from '@paperback/types'

import { fetchText } from '../common/http'
import pbconfig from './pbconfig'
import { MANGA_WORLD_DOMAIN } from './constants/MangaWorld'
import { ChapterParser } from './parsers/ChapterParser'
import { HomeParser } from './parsers/HomeParser'
import { MangaParser } from './parsers/MangaParser'
import { SearchParser } from './parsers/SearchParser'

export class MangaWorldExtension implements Extension, SearchResultsProviding, MangaProviding, ChapterProviding, DiscoverSectionProviding {
  globalRateLimiter = new BasicRateLimiter('mangaworld', {
    numberOfRequests: 2,
    bufferInterval: 1,
    ignoreImages: true,
  })

  private readonly homeParser = new HomeParser()
  private readonly searchParser = new SearchParser()
  private readonly mangaParser = new MangaParser()
  private readonly chapterParser = new ChapterParser()

  async initialise(): Promise<void> {
    this.globalRateLimiter.registerInterceptor()
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: 'popular',
        title: 'Popular Manga',
        type: DiscoverSectionType.simpleCarousel,
      },
    ]
  }

  async getDiscoverSectionItems(): Promise<PagedResults<DiscoverSectionItem>> {
    const html = await fetchText({
      url: MANGA_WORLD_DOMAIN,
      method: 'GET',
    })

    const mangas = this.homeParser.parsePopular(html)

    return {
      items: mangas.map((manga) => ({
        type: 'simpleCarouselItem',
        mangaId: manga.id,
        title: manga.title,
        imageUrl: manga.image,
        contentRating: pbconfig.contentRating,
      })),
    }
  }

  async getSearchResults(query: SearchQuery<unknown[]>): Promise<PagedResults<SearchResultItem>> {
    const html = await fetchText({
      url: `${MANGA_WORLD_DOMAIN}/archive?keyword=${encodeURIComponent(query.title ?? '')}`,
      method: 'GET',
    })

    const mangas = this.searchParser.parse(html)

    return {
      items: mangas.map((manga) => ({
        mangaId: manga.id,
        title: manga.title,
        imageUrl: manga.image,
        contentRating: pbconfig.contentRating,
      })),
    }
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const html = await fetchText({
      url: `${MANGA_WORLD_DOMAIN}/manga/${mangaId}`,
      method: 'GET',
    })

    const manga = this.mangaParser.parse(html)

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: manga.title,
        secondaryTitles: [],
        synopsis: manga.description,
        thumbnailUrl: manga.image,
        status: 'Unknown',
        contentRating: pbconfig.contentRating,
        shareUrl: `${MANGA_WORLD_DOMAIN}/manga/${mangaId}`,
        tagGroups: [
          {
            id: 'genres',
            title: 'Genres',
            tags: manga.genres.map((genre) => ({
              id: genre,
              title: genre,
            })),
          },
        ],
      },
    }
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const html = await fetchText({
      url: `${MANGA_WORLD_DOMAIN}/manga/${sourceManga.mangaId}`,
      method: 'GET',
    })

    const manga = this.mangaParser.parse(html)

    return manga.chapters.map((chapter, index) => ({
      chapterId: chapter.id,
      sourceManga,
      title: chapter.title,
      chapNum: chapter.number,
      volume: 0,
      langCode: 'it',
      sortingIndex: index,
    }))
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const html = await fetchText({
      url: `${MANGA_WORLD_DOMAIN}/read/${chapter.chapterId}`,
      method: 'GET',
    })

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: this.chapterParser.parsePages(html),
    }
  }
}

export const MangaWorld = new MangaWorldExtension()
