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
import { BATCAVE_DOMAIN, BATCAVE_PLACEHOLDER_IMAGE } from '../../lib/sources/BatCave/constants'
import {
    BatCaveChapter,
    BatCaveComicDetails,
    BatCaveParser,
    BatCaveSourceComic
} from '../../lib/sources/BatCave/BatCaveParser'

const SECTION_IDS = {
    POPULAR: 'popular',
    NEW_RELEASES: 'new_releases'
} as const

export const BatCaveInfo: SourceInfo = {
    version: '0.1.0',
    name: 'BatCave',
    icon: 'icon.png',
    author: 'DarkDragonkz',
    description: 'English comics source for BatCave.biz.',
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
        SourceIntents.HOMEPAGE_SECTIONS
}

export class BatCave
    extends Source
    implements MangaProviding, ChapterProviding, HomePageSectionsProviding, SearchResultsProviding {

    private readonly parser = new BatCaveParser()

    requestManager = App.createRequestManager({
        requestsPerSecond: 2,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    referer: `${BATCAVE_DOMAIN}/`,
                    origin: BATCAVE_DOMAIN,
                    'user-agent': 'Mozilla/5.0',
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'accept-language': 'en-US,en;q=0.9'
                }

                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => response
        }
    })

    getMangaShareUrl(mangaId: string): string {
        return `${BATCAVE_DOMAIN}/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const $ = await this.getCheerio(this.getMangaShareUrl(mangaId))
        const details = this.parser.parseComicDetails($, mangaId)

        return this.createSourceManga(details)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const $ = await this.getCheerio(this.getMangaShareUrl(mangaId))
        const chapters = this.parser.parseChapters($, mangaId)

        return chapters.map((chapter: BatCaveChapter) => this.createChapter(chapter))
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const numericId = this.extractNumericComicId(mangaId)
        const url = numericId
            ? `${BATCAVE_DOMAIN}/reader/${numericId}/${chapterId}`
            : this.getMangaShareUrl(mangaId)

        const $ = await this.getCheerio(url)
        const details = this.parser.parseChapterDetails($, mangaId, chapterId)

        return App.createChapterDetails({
            id: details.id,
            mangaId: details.comicId,
            pages: details.pages
        })
    }

    async supportsSearchOperators(): Promise<boolean> {
        return false
    }

    async supportsTagExclusion(): Promise<boolean> {
        return false
    }

    async getSearchResults(query: SearchRequest, _metadata: unknown): Promise<PagedResults> {
        const searchTitle = query.title ?? ''
        const url = `${BATCAVE_DOMAIN}/search/${encodeURIComponent(searchTitle)}`
        const $ = await this.getCheerio(url)
        const results = this.parser.parseSearchResults($)

        return App.createPagedResults({
            results: results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.getCheerio(BATCAVE_DOMAIN)

        const popularItems = this.parser
            .parseHomeItems($, '.sect--popular .poster.grid-item.has-overlay')
            .slice(0, 15)

        const newReleaseItems = this.parser
            .parseHomeItems($, '.sect--hot .poster.grid-item.has-overlay')
            .slice(0, 15)

        if (popularItems.length > 0) {
            sectionCallback(App.createHomeSection({
                id: SECTION_IDS.POPULAR,
                title: 'Popular comics',
                type: 'singleRowNormal',
                containsMoreItems: false,
                items: popularItems.map((item: BatCaveSourceComic) => this.createPartialSourceManga(item))
            }))
        }

        if (newReleaseItems.length > 0) {
            sectionCallback(App.createHomeSection({
                id: SECTION_IDS.NEW_RELEASES,
                title: 'New releases',
                type: 'singleRowNormal',
                containsMoreItems: false,
                items: newReleaseItems.map((item: BatCaveSourceComic) => this.createPartialSourceManga(item))
            }))
        }
    }

    async getViewMoreItems(_homepageSectionId: string, _metadata: unknown): Promise<PagedResults> {
        return App.createPagedResults({
            results: [],
            metadata: undefined
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

    private createSourceManga(details: BatCaveComicDetails): SourceManga {
        return App.createSourceManga({
            id: details.id,
            mangaInfo: App.createMangaInfo({
                image: details.image ?? BATCAVE_PLACEHOLDER_IMAGE,
                titles: [details.title],
                desc: details.description ?? '',
                status: this.mapStatus(details.status),
                author: details.publisher ?? '',
                artist: '',
                tags: details.publisher
                    ? [
                        App.createTagSection({
                            id: 'publisher',
                            label: 'Publisher',
                            tags: [
                                App.createTag({
                                    id: details.publisher.toLowerCase().replace(/\s+/g, '-'),
                                    label: details.publisher
                                })
                            ]
                        })
                    ]
                    : []
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

    private mapStatus(status?: string): string {
        switch ((status ?? '').toLowerCase()) {
            case 'complete':
            case 'completed':
                return 'COMPLETED'
            case 'ongoing':
                return 'ONGOING'
            default:
                return 'UNKNOWN'
        }
    }

    private extractNumericComicId(mangaId: string): string | undefined {
        return mangaId.match(/^(\d+)-/)?.[1]
    }
}
