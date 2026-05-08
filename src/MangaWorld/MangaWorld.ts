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
    SourceManga,
    TagSection
} from '@paperback/types'
import type { CheerioAPI } from 'cheerio'
import { buildUrl } from '../../lib/core/url'
import { MANGA_WORLD_DOMAIN, MANGA_WORLD_PLACEHOLDER_IMAGE } from '../../lib/sources/MangaWorld/constants'
import {
    MangaWorldChapter,
    MangaWorldMangaDetails,
    MangaWorldParser,
    MangaWorldSourceManga,
    MangaWorldTag
} from '../../lib/sources/MangaWorld/MangaWorldParser'

const SECTION_IDS = {
    TRENDING: 'trending',
    MONTHLY: 'monthly',
    NEWEST: 'newest',
    MOST_READ: 'most_read'
} as const

const MANGA_WORLD_USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

export const MangaWorldInfo: SourceInfo = {
    version: '0.2.4',
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
        SourceIntents.HOMEPAGE_SECTIONS |
        SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
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
                    Referer: `${MANGA_WORLD_DOMAIN}/`,
                    Origin: MANGA_WORLD_DOMAIN,
                    'User-Agent': MANGA_WORLD_USER_AGENT,
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

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: MANGA_WORLD_DOMAIN,
            method: 'GET',
            headers: {
                Referer: `${MANGA_WORLD_DOMAIN}/`,
                'User-Agent': MANGA_WORLD_USER_AGENT
            }
        })
    }

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

    async getSearchTags(): Promise<TagSection[]> {
        const $ = await this.getCheerio(`${MANGA_WORLD_DOMAIN}/archive`)
        const tags = this.parser.parseTags($)

        return [
            App.createTagSection({
                id: 'genres',
                label: 'Generi',
                tags: tags.map((tag: MangaWorldTag) => App.createTag({
                    id: tag.id,
                    label: tag.label
                }))
            })
        ]
    }

    async supportsSearchOperators(): Promise<boolean> {
        return false
    }

    async supportsTagExclusion(): Promise<boolean> {
        return false
    }

    async getSearchResults(query: SearchRequest, metadata: unknown): Promise<PagedResults> {
        const searchTitle = query.title ?? ''
        const page = this.getPageFromMetadata(metadata)
        const includedGenres = query.includedTags?.map(tag => tag.id) ?? []

        const url = buildUrl(MANGA_WORLD_DOMAIN, '/archive', {
            keyword: searchTitle,
            genre: includedGenres,
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
            .slice(0, 10)

        const monthlyItems = this.parser
            .parseHomeSectionItemsByHeading($, [
                'Manga del mese',
                'Manga del Mese',
                'Del mese'
            ])
            .slice(0, 12)

        const newestItems = this.parser
            .parseHomeSectionItems($, '.comics-grid .entry')
            .slice(0, 12)

        const mostReadItems = await this.getArchiveItems('most_read', 12)

        if (trendingItems.length > 0) {
            sectionCallback(App.createHomeSection({
                id: SECTION_IDS.TRENDING,
                title: 'In tendenza',
                type: 'singleRowLarge',
                containsMoreItems: true,
                items: trendingItems.map((item: MangaWorldSourceManga) => this.createPartialSourceManga(item))
            }))
        }

        if (monthlyItems.length > 0) {
            sectionCallback(App.createHomeSection({
                id: SECTION_IDS.MONTHLY,
                title: 'Manga del mese',
                type: 'singleRowNormal',
                containsMoreItems: false,
                items: monthlyItems.map((item: MangaWorldSourceManga) => this.createPartialSourceManga(item))
            }))
        }

        if (newestItems.length > 0) {
            sectionCallback(App.createHomeSection({
                id: SECTION_IDS.NEWEST,
                title: 'Ultime aggiunte',
                type: 'singleRowNormal',
                containsMoreItems: true,
                items: newestItems.map((item: MangaWorldSourceManga) => this.createPartialSourceManga(item))
            }))
        }

        if (mostReadItems.length > 0) {
            sectionCallback(App.createHomeSection({
                id: SECTION_IDS.MOST_READ,
                title: 'Più letti',
                type: 'singleRowNormal',
                containsMoreItems: true,
                items: mostReadItems.map((item: MangaWorldSourceManga) => this.createPartialSourceManga(item))
            }))
        }
    }

    async getViewMoreItems(homepageSectionId: string, metadata: unknown): Promise<PagedResults> {
        if (homepageSectionId === SECTION_IDS.MONTHLY) {
            return App.createPagedResults({
                results: [],
                metadata: undefined
            })
        }

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

    private async getArchiveItems(sort: string, limit: number): Promise<MangaWorldSourceManga[]> {
        const url = buildUrl(MANGA_WORLD_DOMAIN, '/archive', { sort })
        const $ = await this.getCheerio(url)

        return this.parser.parseSearchResults($).slice(0, limit)
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
                image: details.image ?? MANGA_WORLD_PLACEHOLDER_IMAGE,
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
            image: manga.image ?? MANGA_WORLD_PLACEHOLDER_IMAGE,
            subtitle: manga.subtitle
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
