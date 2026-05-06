import {
    BadgeColor,
    Chapter,
    ChapterDetails,
    ChapterProviding,
    ContentRating,
    HomePageSectionsProviding,
    HomeSection,
    MangaProviding,
    PagedResults,
    PartialSourceManga,
    Request,
    Response,
    SearchRequest,
    SearchResultsProviding,
    Source,
    SourceInfo,
    SourceIntents,
    SourceManga
} from '@paperback/types'
import type { CheerioAPI } from 'cheerio'
import { buildUrl } from '../../lib/core/url'
import {
    MangaWorldChapter,
    MangaWorldMangaDetails,
    MangaWorldParser,
    MangaWorldSourceManga
} from '../../lib/sources/MangaWorld/MangaWorldParser'

const MANGA_WORLD_DOMAIN = 'https://www.mangaworld.mx'
const PLACEHOLDER_IMAGE = 'https://www.mangaworld.mx/public/assets/images/MangaWorldSquareLogo.png'

const SECTION_IDS = {
    TRENDING: 'trending',
    LATEST: 'latest',
    NEWEST: 'newest',
    MOST_READ: 'most_read'
} as const

export const MangaWorldInfo: SourceInfo = {
    version: '0.1.0',
    name: 'MangaWorld',
    icon: 'icon.png',
    author: 'DarkDragonkz',
    description: 'Source italiana per MangaWorld.',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: MANGA_WORLD_DOMAIN,
    sourceTags: [
        {
            text: 'Italiano',
            type: BadgeColor.GREY
        },
        {
            text: 'MangaWorld',
            type: BadgeColor.BLUE
        }
    ],
    intents:
        SourceIntents.MANGA_CHAPTERS |
        SourceIntents.HOMEPAGE_SECTIONS
}

export class MangaWorld
    extends Source
    implements MangaProviding, ChapterProviding, HomePageSectionsProviding, SearchResultsProviding {

    private readonly parser = new MangaWorldParser()

    requestManager = App.createRequestManager({
        requestsPerSecond: 2,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    referer: `${MANGA_WORLD_DOMAIN}/`,
                    origin: MANGA_WORLD_DOMAIN,
                    'user-agent': 'Mozilla/5.0',
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
                }

                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    getMangaShareUrl(mangaId: string): string {
        return `${MANGA_WORLD_DOMAIN}/manga/${mangaId}/`
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const url = this.getMangaShareUrl(mangaId)
        const $ = await this.getCheerio(url)
        const details = this.parser.parseMangaDetails($, mangaId)

        return this.createSourceManga(details)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const url = this.getMangaShareUrl(mangaId)
        const $ = await this.getCheerio(url)
        const chapters = this.parser.parseChapters($, mangaId)

        return chapters.map((chapter: MangaWorldChapter) => this.createChapter(chapter))
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const url = buildUrl(
            MANGA_WORLD_DOMAIN,
            `/manga/${mangaId}/read/${chapterId}/1`,
            {
                style: 'list'
            }
        )

        const $ = await this.getCheerio(url)
        const details = this.parser.parseChapterDetails($, mangaId, chapterId)

        return App.createChapterDetails({
            id: details.id,
            mangaId: details.mangaId,
            pages: details.pages
        })
    }

    async getSearchResults(query: SearchRequest, metadata: unknown): Promise<PagedResults> {
        const searchTitle = query.title ?? ''
        const page = this.getPageFromMetadata(metadata)

        const url = buildUrl(MANGA_WORLD_DOMAIN, '/archive', {
            keyword: searchTitle,
            page
        })

        const $ = await this.getCheerio(url)
        const results = this.parser.parseSearchResults($)

        return App.createPagedResults({
            results: results.map((result: MangaWorldSourceManga) => this.createPartialSourceManga(result)),
            metadata: results.length > 0
                ? { page: page + 1 }
                : undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.getCheerio(MANGA_WORLD_DOMAIN)

        const trendingItems = this.parser
            .parseHomeSectionItems($, '#chapters-slide .entry.vertical')
            .slice(0, 12)

        const latestItems = this.parser
            .parseHomeSectionItems($, '.comics-grid .entry')
            .slice(0, 18)

        const trendingSection = App.createHomeSection({
            id: SECTION_IDS.TRENDING,
            title: 'In tendenza',
            type: 'singleRowLarge',
            containsMoreItems: true,
            items: trendingItems.map((item: MangaWorldSourceManga) => this.createPartialSourceManga(item))
        })

        const latestSection = App.createHomeSection({
            id: SECTION_IDS.LATEST,
            title: 'Aggiornati di recente',
            type: 'doubleRow',
            containsMoreItems: true,
            items: latestItems.map((item: MangaWorldSourceManga) => this.createPartialSourceManga(item))
        })

        sectionCallback(trendingSection)
        sectionCallback(latestSection)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: unknown): Promise<PagedResults> {
        const page = this.getPageFromMetadata(metadata)

        const sort = this.getSortForSection(homepageSectionId)

        const url = buildUrl(MANGA_WORLD_DOMAIN, '/archive', {
            sort,
            page
        })

        const $ = await this.getCheerio(url)
        const results = this.parser.parseSearchResults($)

        return App.createPagedResults({
            results: results.map((result: MangaWorldSourceManga) => this.createPartialSourceManga(result)),
            metadata: results.length > 0
                ? { page: page + 1 }
                : undefined
        })
    }

    private async getCheerio(url: string): Promise<CheerioAPI> {
        const request = App.createRequest({
            url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = typeof response.data === 'string'
            ? response.data
            : String(response.data)

        return this.cheerio.load(data)
    }

    private createSourceManga(details: MangaWorldMangaDetails): SourceManga {
        const titles = [details.title, ...details.altTitles].filter(Boolean)

        return App.createSourceManga({
            id: details.id,
            mangaInfo: App.createMangaInfo({
                image: details.image ?? PLACEHOLDER_IMAGE,
                titles,
                desc: details.description ?? '',
                status: this.mapStatus(details.status),
                artist: details.artists.join(', '),
                author: details.authors.join(', '),
                tags: [
                    App.createTagSection({
                        id: 'genres',
                        label: 'Generi',
                        tags: details.genres.map((genre: string) => App.createTag({
                            id: genre.toLowerCase().replace(/\s+/g, '-'),
                            label: genre
                        }))
                    })
                ]
            })
        })
    }

    private createPartialSourceManga(manga: MangaWorldSourceManga): PartialSourceManga {
        return App.createPartialSourceManga({
            mangaId: manga.mangaId,
            title: manga.title,
            image: manga.image ?? PLACEHOLDER_IMAGE
        })
    }

    private createChapter(chapter: MangaWorldChapter): Chapter {
        return App.createChapter({
            id: chapter.id,
            name: chapter.name,
            chapNum: chapter.chapNum ?? 0,
            volume: chapter.volume,
            time: chapter.time
        })
    }

    private getSortForSection(homepageSectionId: string): string {
        switch (homepageSectionId) {
            case SECTION_IDS.TRENDING:
                return 'most_read'
            case SECTION_IDS.LATEST:
                return 'newest'
            case SECTION_IDS.NEWEST:
                return 'newest'
            case SECTION_IDS.MOST_READ:
                return 'most_read'
            default:
                return 'newest'
        }
    }

    private mapStatus(status?: string): string {
        switch ((status ?? '').toLowerCase()) {
            case 'in corso':
                return 'ONGOING'
            case 'finito':
                return 'COMPLETED'
            case 'droppato':
                return 'DROPPED'
            case 'in pausa':
                return 'HIATUS'
            default:
                return 'UNKNOWN'
        }
    }

    private getPageFromMetadata(metadata: unknown): number {
        if (!metadata || typeof metadata !== 'object') {
            return 1
        }

        const page = (metadata as { page?: unknown }).page

        return typeof page === 'number' && Number.isFinite(page)
            ? page
            : 1
    }
}
