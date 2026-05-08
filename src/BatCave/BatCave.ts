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
import { BATCAVE_DOMAIN, BATCAVE_PLACEHOLDER_IMAGE } from '../../lib/sources/BatCave/constants'
import {
    BatCaveChapter,
    BatCaveComicDetails,
    BatCaveParser,
    BatCaveSourceComic,
    BatCaveTag
} from '../../lib/sources/BatCave/BatCaveParser'

const SECTION_IDS = {
    LATEST: 'latest'
} as const

const BATCAVE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const BATCAVE_FALLBACK_ITEMS: BatCaveSourceComic[] = [
    {
        comicId: '33758-batman-2025',
        title: 'Batman (2025-)',
        image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/24/6d05b97e996488d756edfb9102406a.webp`,
        subtitle: 'Fallback item • BatCave request returned no catalogue results'
    },
    {
        comicId: '6975-invincible-2003',
        title: 'Invincible (2003)',
        image: `${BATCAVE_DOMAIN}/uploads/posts/poster/69/6975-invincible-2003.jpg`,
        subtitle: 'Fallback item • BatCave request returned no catalogue results'
    },
    {
        comicId: '561-batman',
        title: 'Batman (2016-)',
        image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/c6/ed42565ee2951f427acb19aca058e8.webp`,
        subtitle: 'Fallback item • BatCave request returned no catalogue results'
    }
]

export const BatCaveInfo: SourceInfo = {
    version: '0.1.4',
    name: 'BatCave',
    icon: 'icon.png',
    author: 'DarkDragonkz',
    description: 'Source inglese per BatCave.biz.',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: BATCAVE_DOMAIN,
    sourceTags: [
        {
            text: 'English',
            type: BadgeColor.GREY
        },
        {
            text: 'Comics',
            type: BadgeColor.BLUE
        }
    ],
    intents:
        SourceIntents.MANGA_CHAPTERS |
        SourceIntents.HOMEPAGE_SECTIONS |
        SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class BatCave
    extends Source
    implements MangaProviding, ChapterProviding, HomePageSectionsProviding, SearchResultsProviding {

    private readonly parser = new BatCaveParser()

    requestManager = App.createRequestManager({
        requestsPerSecond: 1,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    Referer: `${BATCAVE_DOMAIN}/`,
                    Origin: BATCAVE_DOMAIN,
                    'User-Agent': BATCAVE_USER_AGENT,
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'accept-language': 'en-US,en;q=0.9'
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
            url: BATCAVE_DOMAIN,
            method: 'GET',
            headers: {
                Referer: `${BATCAVE_DOMAIN}/`,
                'User-Agent': BATCAVE_USER_AGENT
            }
        })
    }

    getMangaShareUrl(mangaId: string): string {
        return `${BATCAVE_DOMAIN}/${mangaId}.html`
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const $ = await this.getCheerio(this.getMangaShareUrl(mangaId))
        const details = this.parser.parseComicDetails($, mangaId)

        return this.createSourceManga(details)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const $ = await this.getCheerio(this.getMangaShareUrl(mangaId))
        let chapters = this.parser.parseChapters($, mangaId)

        const firstReaderPath = this.getFirstReaderPath($)

        if (firstReaderPath) {
            const reader = await this.getCheerio(this.absoluteUrl(firstReaderPath))
            const readerChapters = this.parser.parseReaderChapters(reader, mangaId)

            if (readerChapters.length > chapters.length) {
                chapters = readerChapters
            }
        }

        return chapters.map((chapter: BatCaveChapter) => this.createChapter(chapter))
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const postId = this.parser.extractPostId(mangaId)
        const url = postId
            ? `${BATCAVE_DOMAIN}/reader/${postId}/${chapterId}`
            : `${BATCAVE_DOMAIN}/reader/${mangaId}/${chapterId}`

        const $ = await this.getCheerio(url)
        const details = this.parser.parseChapterDetails($, mangaId, chapterId)

        return App.createChapterDetails({
            id: details.id,
            mangaId: details.comicId,
            pages: details.pages
        })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const $ = await this.getCheerio(`${BATCAVE_DOMAIN}/comix/`)
        const tags = this.parser.parseTags($)

        return [
            App.createTagSection({
                id: 'genres',
                label: 'Genres',
                tags: tags.map((tag: BatCaveTag) => App.createTag({
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
        const includedGenre = query.includedTags?.[0]?.id

        if (includedGenre && searchTitle.length === 0) {
            return this.getGenreResults(includedGenre, metadata)
        }

        const $ = await this.getSearchCheerio(searchTitle)
        const results = this.parser.parseCatalogueResults($)

        return App.createPagedResults({
            results: results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const items = await this.getHomepageItems()

        this.emitHomeSection(
            sectionCallback,
            SECTION_IDS.LATEST,
            items === BATCAVE_FALLBACK_ITEMS ? 'BatCave diagnostics' : 'Latest comics',
            'singleRowNormal',
            true,
            items
        )
    }

    async getViewMoreItems(homepageSectionId: string, metadata: unknown): Promise<PagedResults> {
        if (homepageSectionId !== SECTION_IDS.LATEST) {
            return App.createPagedResults({
                results: [],
                metadata: undefined
            })
        }

        const page = this.getPageFromMetadata(metadata)
        const url = page <= 1
            ? `${BATCAVE_DOMAIN}/comix/`
            : `${BATCAVE_DOMAIN}/comix/page/${page}/`

        const results = await this.getCatalogueItemsFromUrl(url)

        return App.createPagedResults({
            results: results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: results.length > 0
                ? { page: page + 1 }
                : undefined
        })
    }

    private async getHomepageItems(): Promise<BatCaveSourceComic[]> {
        const urls = [
            `${BATCAVE_DOMAIN}/comix/`,
            `${BATCAVE_DOMAIN}/ComicList/`,
            BATCAVE_DOMAIN
        ]

        for (const url of urls) {
            const items = await this.getCatalogueItemsFromUrl(url)

            if (items.length > 0) {
                return items.slice(0, 20)
            }
        }

        return BATCAVE_FALLBACK_ITEMS
    }

    private async getCatalogueItemsFromUrl(url: string): Promise<BatCaveSourceComic[]> {
        try {
            const $ = await this.getCheerio(url)
            return this.parser.parseCatalogueResults($)
        } catch {
            return []
        }
    }

    private async getGenreResults(genreId: string, metadata: unknown): Promise<PagedResults> {
        const page = this.getPageFromMetadata(metadata)
        const url = page <= 1
            ? `${BATCAVE_DOMAIN}/genres/${encodeURIComponent(genreId)}/`
            : `${BATCAVE_DOMAIN}/genres/${encodeURIComponent(genreId)}/page/${page}/`

        const results = await this.getCatalogueItemsFromUrl(url)

        return App.createPagedResults({
            results: results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: results.length > 0
                ? { page: page + 1 }
                : undefined
        })
    }

    private async getSearchCheerio(searchTitle: string): Promise<CheerioAPI> {
        const request = App.createRequest({
            url: BATCAVE_DOMAIN,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: `do=search&subaction=search&story=${encodeURIComponent(searchTitle)}`
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = typeof response.data === 'string'
            ? response.data
            : String(response.data)

        return this.cheerio.load(data)
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

    private createSourceManga(details: BatCaveComicDetails): SourceManga {
        return App.createSourceManga({
            id: details.id,
            mangaInfo: App.createMangaInfo({
                image: details.image ?? BATCAVE_PLACEHOLDER_IMAGE,
                titles: [details.title].filter(Boolean),
                desc: details.description ?? '',
                status: this.mapStatus(details.status),
                artist: details.artists.join(', '),
                author: details.authors.join(', '),
                tags: [
                    App.createTagSection({
                        id: 'genres',
                        label: 'Genres',
                        tags: details.genres.map((genre: string) => App.createTag({
                            id: genre,
                            label: genre
                        }))
                    })
                ]
            })
        })
    }

    private createPartialSourceManga(comic: BatCaveSourceComic): PartialSourceManga {
        return App.createPartialSourceManga({
            mangaId: comic.comicId,
            title: comic.title,
            image: comic.image ?? BATCAVE_PLACEHOLDER_IMAGE,
            subtitle: comic.subtitle
        })
    }

    private createChapter(chapter: BatCaveChapter): Chapter {
        return App.createChapter({
            id: chapter.id,
            name: chapter.name,
            chapNum: chapter.chapNum ?? 0,
            time: chapter.time
        })
    }

    private emitHomeSection(
        sectionCallback: (section: HomeSection) => void,
        id: string,
        title: string,
        type: 'singleRowLarge' | 'singleRowNormal',
        containsMoreItems: boolean,
        items: BatCaveSourceComic[]
    ): void {
        if (items.length === 0) {
            return
        }

        sectionCallback(App.createHomeSection({
            id,
            title,
            type,
            containsMoreItems,
            items: items.map((item: BatCaveSourceComic) => this.createPartialSourceManga(item))
        }))
    }

    private getFirstReaderPath($: CheerioAPI): string | undefined {
        return $('.page__btns a[href*="/reader/"]').first().attr('href')
            || $('a[href*="/reader/"]').first().attr('href')
    }

    private absoluteUrl(url: string): string {
        if (url.startsWith('http')) {
            return url
        }

        return url.startsWith('/')
            ? `${BATCAVE_DOMAIN}${url}`
            : `${BATCAVE_DOMAIN}/${url}`
    }

    private mapStatus(status?: string): string {
        switch ((status ?? '').toLowerCase()) {
            case 'completed':
            case 'complete':
                return 'COMPLETED'
            case 'ongoing':
            case 'continuing':
                return 'ONGOING'
            case 'hiatus':
                return 'HIATUS'
            case 'cancelled':
            case 'canceled':
                return 'DROPPED'
            default:
                return 'UNKNOWN'
        }
    }

    private getPageFromMetadata(metadata: unknown): number {
        if (!metadata || typeof metadata !== 'object') {
            return 2
        }

        const page = (metadata as { page?: unknown }).page

        return typeof page === 'number' && Number.isFinite(page)
            ? page
            : 2
    }
}
