import {
    BadgeColor,
    Chapter,
    ChapterDetails,
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
import { BATCAVE_DOMAIN, BATCAVE_PLACEHOLDER_IMAGE } from '../../lib/sources/BatCave/constants'
import { BatCaveHomeItem, BatCaveParser } from '../../lib/sources/BatCave/BatCaveParser'

const BATCAVE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

export const BatCaveInfo: SourceInfo = {
    version: '0.1.4',
    name: 'BatCave',
    icon: 'icon.png',
    author: 'DarkDragonkz',
    description: 'English comics source for BatCave.biz.',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: BATCAVE_DOMAIN,
    sourceTags: [
        { text: 'English', type: BadgeColor.GREY },
        { text: 'Comics', type: BadgeColor.BLUE }
    ],
    intents: SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class BatCave extends Source implements MangaProviding, HomePageSectionsProviding, SearchResultsProviding {
    private readonly parser = new BatCaveParser()

    requestManager = App.createRequestManager({
        requestsPerSecond: 2,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    Referer: `${BATCAVE_DOMAIN}/`,
                    'User-Agent': BATCAVE_USER_AGENT,
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'accept-language': 'en-US,en;q=0.9'
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => response
        }
    })

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.getCheerio(BATCAVE_DOMAIN)
        const items = this.parser.parseFeaturedHomeItems($).slice(0, 16)
        if (items.length === 0) return

        sectionCallback(App.createHomeSection({
            id: 'featured',
            title: 'Featured Comics',
            type: 'singleRowLarge',
            containsMoreItems: false,
            items: items.map((item: BatCaveHomeItem) => this.createPartialSourceManga(item))
        }))
    }

    async getViewMoreItems(_homepageSectionId: string, _metadata: unknown): Promise<PagedResults> {
        return App.createPagedResults({ results: [], metadata: undefined })
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                image: BATCAVE_PLACEHOLDER_IMAGE,
                titles: [mangaId],
                desc: '',
                status: 'UNKNOWN',
                artist: '',
                author: '',
                tags: []
            })
        })
    }

    async getChapters(_mangaId: string): Promise<Chapter[]> { return [] }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        return App.createChapterDetails({ id: chapterId, mangaId, pages: [] })
    }

    async getSearchResults(_query: SearchRequest, _metadata: unknown): Promise<PagedResults> {
        return App.createPagedResults({ results: [], metadata: undefined })
    }

    async supportsSearchOperators(): Promise<boolean> { return false }

    async supportsTagExclusion(): Promise<boolean> { return false }

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

    getMangaShareUrl(mangaId: string): string { return `${BATCAVE_DOMAIN}/${mangaId}` }

    private async getCheerio(url: string): Promise<CheerioAPI> {
        const response = await this.requestManager.schedule(App.createRequest({ url, method: 'GET' }), 2)
        const data = typeof response.data === 'string' ? response.data : String(response.data)
        return this.cheerio.load(data)
    }

    private createPartialSourceManga(item: BatCaveHomeItem): PartialSourceManga {
        return App.createPartialSourceManga({
            mangaId: item.comicId,
            title: item.title,
            image: item.image ?? BATCAVE_PLACEHOLDER_IMAGE,
            subtitle: item.subtitle
        })
    }
}
