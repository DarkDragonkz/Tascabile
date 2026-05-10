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
  type JSONValue,
  type MangaProviding,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SortingOption,
  type SourceManga,
} from '@paperback/types'

import { fetchText } from '../common/http'
import pbconfig from './pbconfig'
import { MANGA_WORLD_DOMAIN } from './constants/MangaWorld'
import type { MangaUpdate } from './parsers/HomeParser'
import { ChapterParser } from './parsers/ChapterParser'
import { HomeParser } from './parsers/HomeParser'
import { MangaParser } from './parsers/MangaParser'
import { SearchParser } from './parsers/SearchParser'

const DISCOVER_SECTION_IDS = {
  TRENDING: 'trending',
  LATEST_UPDATES: 'latest-updates',
  LATEST_ADDED: 'latest-added',
} as const

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
        id: DISCOVER_SECTION_IDS.TRENDING,
        title: 'Capitoli di tendenza',
        type: DiscoverSectionType.featured,
      },
      {
        id: DISCOVER_SECTION_IDS.LATEST_UPDATES,
        title: 'Ultimi aggiornamenti',
        type: DiscoverSectionType.chapterUpdates,
      },
      {
        id: DISCOVER_SECTION_IDS.LATEST_ADDED,
        title: 'Ultime aggiunte',
        type: DiscoverSectionType.prominentCarousel,
      },
    ]
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    _metadata: JSONValue | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const html = await fetchText({
      url: MANGA_WORLD_DOMAIN,
      method: 'GET',
    })

    if (section.id === DISCOVER_SECTION_IDS.LATEST_UPDATES) {
      return {
        items: this.homeParser.parseLatest(html).map((manga) => this.toChapterUpdateItem(manga)),
        metadata: undefined,
      }
    }

    if (section.id === DISCOVER_SECTION_IDS.LATEST_ADDED) {
      return {
        items: this.homeParser.parseLatest(html).map((manga) => this.toProminentItem(manga)),
        metadata: undefined,
      }
    }

    return {
      items: this.homeParser.parseTrending(html).map((manga) => this.toFeaturedItem(manga)),
      metadata: undefined,
    }
  }

  async getSearchResults(
    query: SearchQuery<JSONValue>,
    metadata: JSONValue | undefined,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = typeof metadata === 'object' && metadata && 'page' in metadata
      ? Number((metadata as { page?: number }).page ?? 1)
      : 1

    const keyword = String(query.title ?? '')
      .replace(/[\/]+/g, ' ')
      .trim()

    const html = await fetchText({
      url: `${MANGA_WORLD_DOMAIN}/archive?keyword=${encodeURIComponent(keyword)}&page=${page}`,
      method: 'GET',
    })

    const mangas = this.searchParser.parse(html)

    return {
      items: mangas.map((manga) => ({
        mangaId: manga.id,
        title: manga.title,
        imageUrl: manga.image,
        subtitle: manga.subtitle,
        contentRating: pbconfig.contentRating,
      })),
      metadata: mangas.length > 0 ? { page: page + 1 } : undefined,
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
        secondaryTitles: manga.altTitles,
        synopsis: manga.description,
        thumbnailUrl: manga.image,
        status: manga.status ?? 'Unknown',
        contentRating: pbconfig.contentRating,
        shareUrl: `${MANGA_WORLD_DOMAIN}/manga/${mangaId}`,
        tagGroups: [
          {
            id: 'genres',
            title: 'Genres',
            tags: manga.genres.map((genre) => ({
              id: this.toSafeId(genre),
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

  private toFeaturedItem(manga: MangaUpdate): DiscoverSectionItem {
    return {
      type: 'featuredCarouselItem',
      mangaId: manga.id,
      title: manga.title,
      supertitle: manga.chapterTitle ?? manga.subtitle,
      imageUrl: manga.image,
      contentRating: pbconfig.contentRating,
    }
  }

  private toProminentItem(manga: MangaUpdate): DiscoverSectionItem {
    return {
      type: 'prominentCarouselItem',
      mangaId: manga.id,
      title: manga.title,
      subtitle: manga.subtitle,
      imageUrl: manga.image,
      contentRating: pbconfig.contentRating,
    }
  }

  private toChapterUpdateItem(manga: MangaUpdate): DiscoverSectionItem {
    return {
      type: 'chapterUpdatesCarouselItem',
      mangaId: manga.id,
      chapterId: manga.chapterId ?? manga.id,
      title: manga.title,
      subtitle: manga.chapterTitle,
      imageUrl: manga.image,
      contentRating: pbconfig.contentRating,
    }
  }

  private toSafeId(value: string): string {
    const safe = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._\-@()[\]%?#+=/&:]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    return safe || 'unknown'
  }
}

export const MangaWorld = new MangaWorldExtension()
