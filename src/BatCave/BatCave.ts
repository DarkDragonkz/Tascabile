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
    TOP_RATED: 'top_rated',
    LATEST: 'latest'
} as const

interface BatCaveSearchPage {
    results: BatCaveSourceComic[]
    hasMore: boolean
}

interface BatCaveHomeSections {
    featured: BatCaveSourceComic[]
    topRated: BatCaveSourceComic[]
    latest: BatCaveSourceComic[]
}

export const BatCaveInfo: SourceInfo = {
    version: '0.1.16',
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
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}

export class BatCave extends Source implements MangaProviding, ChapterProviding, HomePageSectionsProviding, SearchResultsProviding {
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
        const url = numericId ? `${BATCAVE_DOMAIN}/reader/${numericId}/${chapterId}` : this.getMangaShareUrl(mangaId)
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
                tags: tags.publishers.map((tag: BatCaveTag) => App.createTag({ id: tag.id, label: tag.label }))
            }))
        }

        if (tags.years.length > 0) {
            sections.push(App.createTagSection({
                id: 'years',
                label: 'Years',
                tags: tags.years.map((tag: BatCaveTag) => App.createTag({ id: tag.id, label: tag.label }))
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
        const searchTerms = this.getSearchTerms(query)

        if (!searchTerms) {
            return App.createPagedResults({ results: [], metadata: undefined })
        }

        const searchPage = await this.getSearchPage(searchTerms, page)

        return App.createPagedResults({
            results: searchPage.results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: searchPage.hasMore ? { page: page + 1 } : undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const fallbackSections = this.getFallbackHomeSections()

        try {
            const $ = await this.getCheerio(BATCAVE_DOMAIN)
            const allItems = this.dedupeItems(this.parser.parseHomeItems($, 'a.poster.grid-item.has-overlay, a.poster, a.popular'))
            const featuredItems = this.dedupeItems(this.parser.parseHomeItems($, '.owl-stage a.poster, .owl-stage-outer a.poster, a.poster[data-hot_marker]')).slice(0, 15)
            const topRatedItems = this.dedupeItems(this.parser.parseHomeItems($, '.side-block__content--populars a.popular, a.popular'))
                .filter((item: BatCaveSourceComic) => !featuredItems.some((featured: BatCaveSourceComic) => featured.comicId === item.comicId))
                .slice(0, 15)
            const latestItems = allItems
                .filter((item: BatCaveSourceComic) => !featuredItems.some((featured: BatCaveSourceComic) => featured.comicId === item.comicId))
                .filter((item: BatCaveSourceComic) => !topRatedItems.some((topRated: BatCaveSourceComic) => topRated.comicId === item.comicId))
                .slice(0, 15)

            this.sendHomeSection(sectionCallback, SECTION_IDS.FEATURED, 'Featured Comics', 'singleRowLarge', featuredItems.length > 0 ? featuredItems : fallbackSections.featured, true)
            this.sendHomeSection(sectionCallback, SECTION_IDS.TOP_RATED, 'Top Rated Comics', 'singleRowNormal', topRatedItems.length > 0 ? topRatedItems : fallbackSections.topRated, true)
            this.sendHomeSection(sectionCallback, SECTION_IDS.LATEST, 'Latest Updates', 'doubleRow', latestItems.length > 0 ? latestItems : fallbackSections.latest, true)
            return
        } catch {
            this.sendFallbackHomeSections(sectionCallback, fallbackSections)
        }
    }

    async getViewMoreItems(homepageSectionId: string, metadata: unknown): Promise<PagedResults> {
        const page = this.getPageFromMetadata(metadata)
        const url = `${BATCAVE_DOMAIN}/page/${page}/`
        const $ = await this.getCheerio(url)
        const results = this.dedupeItems(this.parser.parseHomeItems($, 'a.poster.grid-item.has-overlay, a.poster, a.popular'))

        return App.createPagedResults({
            results: results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: results.length > 0 ? { page: page + 1 } : undefined
        })
    }

    private async getCheerio(url: string): Promise<CheerioAPI> {
        const request = App.createRequest({ url, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const data = typeof response.data === 'string' ? response.data : String(response.data)

        return this.cheerio.load(data)
    }

    private async getSearchPage(searchTerms: string, page: number): Promise<BatCaveSearchPage> {
        const encodedQuery = encodeURIComponent(searchTerms)
        const url = page <= 1
            ? `${BATCAVE_DOMAIN}/search/${encodedQuery}`
            : `${BATCAVE_DOMAIN}/search/${encodedQuery}/page/${page}/`
        const $ = await this.getCheerio(url)
        const results = this.parser.parseSearchResults($)

        return {
            results,
            hasMore: this.hasMoreSearchResults($)
        }
    }

    private hasMoreSearchResults($: CheerioAPI): boolean {
        const text = this.cleanText($.root().text())
        const rangeMatch = text.match(/Your query found\s+(\d+)\s+answers?\s*\(\s*Query results\s+(\d+)\s*-\s*(\d+)\s*\)/i)

        if (!rangeMatch) return false

        const total = Number.parseInt(rangeMatch[1], 10)
        const end = Number.parseInt(rangeMatch[3], 10)

        return Number.isFinite(total) && Number.isFinite(end) && end < total
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
                    ? [App.createTagSection({
                        id: 'publisher',
                        label: 'Publisher',
                        tags: [App.createTag({ id: details.publisher.toLowerCase().replace(/\s+/g, '-'), label: details.publisher })]
                    })]
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

    private sendHomeSection(sectionCallback: (section: HomeSection) => void, id: string, title: string, type: 'singleRowLarge' | 'singleRowNormal' | 'doubleRow', items: BatCaveSourceComic[], containsMoreItems: boolean): void {
        if (items.length === 0) return

        sectionCallback(App.createHomeSection({
            id,
            title,
            type,
            containsMoreItems,
            items: items.map((item: BatCaveSourceComic) => this.createPartialSourceManga(item))
        }))
    }

    private sendFallbackHomeSections(sectionCallback: (section: HomeSection) => void, fallbackSections: BatCaveHomeSections): void {
        this.sendHomeSection(sectionCallback, SECTION_IDS.FEATURED, 'Featured Comics', 'singleRowLarge', fallbackSections.featured, true)
        this.sendHomeSection(sectionCallback, SECTION_IDS.TOP_RATED, 'Top Rated Comics', 'singleRowNormal', fallbackSections.topRated, true)
        this.sendHomeSection(sectionCallback, SECTION_IDS.LATEST, 'Latest Updates', 'doubleRow', fallbackSections.latest, true)
    }

    private getFallbackHomeSections(): BatCaveHomeSections {
        return {
            featured: [
                { comicId: '32394-ultimate-spider-man-2024.html', title: 'Ultimate Spider-Man (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/55/98c052976e162080e5a0be8c9fb31f.jpg`, subtitle: 'Marvel Comics • 2024' },
                { comicId: '2395-green-lantern.html', title: 'Green Lantern (2023-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/b9/4d6b2820842cc41b14d14b6720c0f3.jpg`, subtitle: 'DC Comics • 2023' },
                { comicId: '99-action-comics.html', title: 'Action Comics (2016-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/50/7c571952a923d6495c3a5e9809c9cf.jpg`, subtitle: 'DC Comics • 2016' },
                { comicId: '33124-batgirl-2024.html', title: 'Batgirl (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/91/bc114b5aea67915050dc331be3db9c.jpg`, subtitle: 'DC Comics • 2024' },
                { comicId: '33524-invincible-universe-battle-beast-2025.html', title: 'Invincible Universe: Battle Beast (2025-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/ab/d52803037615cc2d8fe030ea3434bd.jpg`, subtitle: 'Image Comics • 2025' },
                { comicId: '32886-uncanny-x-men-2024.html', title: 'Uncanny X-Men (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/1f/f89c248846ebadf94bf34ace5f9c7f.jpg`, subtitle: 'Marvel Comics • 2024' }
            ],
            topRated: [
                { comicId: '6975-invincible-2003.html', title: 'Invincible (2003)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/25/f6a2dd4c3708ea1519f0ac28084790.jpg`, subtitle: 'Top Rated' },
                { comicId: '33051-absolute-batman-2024.html', title: 'Absolute Batman (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/6e/fdb398ba48cfbe9c2b9c2fa9a917af.jpg`, subtitle: 'Top Rated' },
                { comicId: '2913-invincible-compendium.html', title: 'Invincible Compendium (2011-2018)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/6c/e9e3eabcf5e389cdc0ed9765c2c6bd.jpg`, subtitle: 'Top Rated' },
                { comicId: '12291-crossed.html', title: 'Crossed', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/58/f2213bc20847aa3052113b0be7b3f8.jpg`, subtitle: 'Top Rated' },
                { comicId: '5629-the-boys-2006-2012.html', title: 'The Boys (2006-2012)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/56/8b8e7405896d1bd972611d99867242.jpg`, subtitle: 'Top Rated' }
            ],
            latest: [
                { comicId: '34344-ghoul-2026.html', title: 'Ghoul (2026)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/11/91acbf52971fb5d2f7159da355548c.jpg`, subtitle: 'Just Added' },
                { comicId: '34343-dc-x-sonic-the-hedgehog-the-metal-legion-2026.html', title: 'DC x Sonic the Hedgehog: The Metal Legion (2026-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/5c/bacfff4451c27a13cd8cd57da30908.jpg`, subtitle: 'Just Added' },
                { comicId: '34342-tales-of-the-green-lantern-corps-guy-gardner-2026.html', title: 'Tales of the Green Lantern Corps: Guy Gardner (2026-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/cb/0c2e11a96a31dd6030d3f6fcd67cf4.jpg`, subtitle: 'Just Added' },
                { comicId: '34341-sleepy-hollow-the-witches-of-the-western-wood-2026.html', title: 'Sleepy Hollow: The Witches of the Western Wood (2026-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/c6/a8ef5f12c6c60a893b6c5dbe75d13b.jpg`, subtitle: 'Just Added' },
                { comicId: '34340-astonishing-miles-morales-spider-man-the-art-of-thwip-2026.html', title: 'Astonishing Miles Morales: Spider-Man – The Art of Thwip (2026-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/95/6277603f5d6d70bee677808f91cf65.jpg`, subtitle: 'Just Added' }
            ]
        }
    }

    private dedupeItems(items: BatCaveSourceComic[]): BatCaveSourceComic[] {
        const seen = new Set<string>()
        const deduped: BatCaveSourceComic[] = []

        for (const item of items) {
            if (seen.has(item.comicId)) continue
            seen.add(item.comicId)
            deduped.push(item)
        }

        return deduped
    }

    private getSearchTerms(query: SearchRequest): string {
        const queryWithFallbacks = query as SearchRequest & { query?: string; searchTerm?: string; text?: string }
        const title = query.title ?? queryWithFallbacks.query ?? queryWithFallbacks.searchTerm ?? queryWithFallbacks.text ?? ''
        const includedTags = query.includedTags?.map(tag => tag.label).filter(Boolean) ?? []

        return [title, ...includedTags].filter(Boolean).join(' ').trim()
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
        if (!metadata || typeof metadata !== 'object') return 1

        const page = (metadata as { page?: unknown }).page

        return typeof page === 'number' && Number.isFinite(page) ? page : 1
    }

    private cleanText(value: string): string {
        return value.replace(/\s+/g, ' ').trim()
    }
}
