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
    FEATURED: 'featured',
    HOT: 'hot',
    LATEST: 'latest'
} as const

const BATCAVE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

export const BatCaveInfo: SourceInfo = {
    version: '0.1.3',
    name: 'BatCave',
    icon: 'icon.png',
    author: 'DarkDragonkz',
    description: 'English comics source for BatCave.biz.',
    contentRating: ContentRating.MATURE,
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
        requestsPerSecond: 4,
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

    async getSearchTags(): Promise<TagSection[]> {
        const $ = await this.getCheerio(BATCAVE_DOMAIN)
        const tags = this.parser.parseTags($)
        const sections: TagSection[] = []

        if (tags.publishers.length > 0) {
            sections.push(App.createTagSection({
                id: 'publishers',
                label: 'Publishers',
                tags: tags.publishers.map((tag: BatCaveTag) => App.createTag({
                    id: tag.id,
                    label: tag.label
                }))
            }))
        }

        if (tags.years.length > 0) {
            sections.push(App.createTagSection({
                id: 'years',
                label: 'Years',
                tags: tags.years.map((tag: BatCaveTag) => App.createTag({
                    id: tag.id,
                    label: tag.label
                }))
            }))
        }

        return sections
    }

    async supportsSearchOperators(): Promise<boolean> {
        return false
    }

    async supportsTagExclusion(): Promise<boolean> {
        return false
    }

    async getSearchResults(query: SearchRequest, metadata: unknown): Promise<PagedResults> {
        const page = this.getPageFromMetadata(metadata)
        const searchTitle = query.title ?? ''
        const includedTags = query.includedTags?.map(tag => tag.label).filter(Boolean) ?? []
        const searchTerms = [searchTitle, ...includedTags].filter(Boolean).join(' ')
        const encodedSearchTerms = encodeURIComponent(searchTerms)
        const url = `${BATCAVE_DOMAIN}/index.php?do=search&subaction=search&story=${encodedSearchTerms}&search_start=${page}`
        const $ = await this.getCheerio(url)
        const results = this.parser.parseSearchResults($)

        return App.createPagedResults({
            results: results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: results.length > 0
                ? { page: page + 1 }
                : undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.getCheerio(BATCAVE_DOMAIN)

        const featuredItems = this.dedupeItems(this.parser.parseHomeItems(
            $,
            '.sect--popular .poster, .carou .poster, #owl-carou .poster, a.poster[data-hot_marker]'
        )).slice(0, 15)

        const hotItems = this.dedupeItems(this.parser.parseHomeItems(
            $,
            '.sect--hot .poster, section:has(.sect__title:contains("Hot new releases")) .poster'
        )).filter((item: BatCaveSourceComic) => !featuredItems.some((featured: BatCaveSourceComic) => featured.comicId === item.comicId))
            .slice(0, 15)

        const allItems = this.dedupeItems(this.parser.parseHomeItems($, 'a.poster.grid-item.has-overlay, a.poster'))
        const latestItems = allItems
            .filter((item: BatCaveSourceComic) => !featuredItems.some((featured: BatCaveSourceComic) => featured.comicId === item.comicId))
            .filter((item: BatCaveSourceComic) => !hotItems.some((hot: BatCaveSourceComic) => hot.comicId === item.comicId))
            .slice(0, 15)

        this.sendHomeSection(sectionCallback, SECTION_IDS.FEATURED, 'Featured Comics 🔥', 'singleRowLarge', featuredItems.length > 0 ? featuredItems : allItems.slice(0, 15), false)
        this.sendHomeSection(sectionCallback, SECTION_IDS.HOT, 'Hot New Releases ⚡', 'singleRowNormal', hotItems.length > 0 ? hotItems : allItems.slice(15, 30), false)
        this.sendHomeSection(sectionCallback, SECTION_IDS.LATEST, 'Latest Updates 🆙', 'doubleRow', latestItems.length > 0 ? latestItems : allItems.slice(30, 45), true)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: unknown): Promise<PagedResults> {
        if (homepageSectionId !== SECTION_IDS.LATEST) {
            return App.createPagedResults({
                results: [],
                metadata: undefined
            })
        }

        const page = this.getPageFromMetadata(metadata)
        const url = page === 1
            ? BATCAVE_DOMAIN
            : `${BATCAVE_DOMAIN}/page/${page}/`
        const $ = await this.getCheerio(url)
        const results = this.dedupeItems(this.parser.parseHomeItems($, 'a.poster.grid-item.has-overlay, a.poster'))

        return App.createPagedResults({
            results: results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: results.length > 0
                ? { page: page + 1 }
                : undefined
        })
    }

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

    private async getCheerio(url: string): Promise<CheerioAPI> {
        const request = App.createRequest({
            url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 2)
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
            time: chapter.time,
            langCode: 'en'
        })
    }

    private sendHomeSection(
        sectionCallback: (section: HomeSection) => void,
        id: string,
        title: string,
        type: 'singleRowLarge' | 'singleRowNormal' | 'doubleRow',
        items: BatCaveSourceComic[],
        containsMoreItems: boolean
    ): void {
        if (items.length === 0) {
            return
        }

        const section = App.createHomeSection({
            id,
            title,
            containsMoreItems,
            type
        })

        section.items = items.map((item: BatCaveSourceComic) => this.createPartialSourceManga(item))
        sectionCallback(section)
    }

    private dedupeItems(items: BatCaveSourceComic[]): BatCaveSourceComic[] {
        const seen = new Set<string>()
        const deduped: BatCaveSourceComic[] = []

        for (const item of items) {
            if (seen.has(item.comicId)) {
                continue
            }

            seen.add(item.comicId)
            deduped.push(item)
        }

        return deduped
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
