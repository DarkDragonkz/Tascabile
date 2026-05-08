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
    TOP_RATED: 'top_rated',
    LATEST: 'latest'
} as const

interface BatCaveSearchPage {
    results: BatCaveSourceComic[]
    hasMore: boolean
}

export const BatCaveInfo: SourceInfo = {
    version: '0.2.0',
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
        const searchTerms = this.getSearchTerms(query)

        if (!searchTerms) {
            return App.createPagedResults({ results: [], metadata: undefined })
        }

        const page = this.getPageFromMetadata(metadata)
        const searchPage = await this.getSearchPage(searchTerms, page)

        return App.createPagedResults({
            results: searchPage.results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: searchPage.hasMore ? { page: page + 1 } : undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.getCheerio(BATCAVE_DOMAIN)
        const featured = this.parser.parseHomeItems($, '.sect--popular a.poster, #owl-carou a.poster, .owl-stage a.poster, .owl-stage-outer a.poster').slice(0, 16)
        const hot = this.parser.parseHomeItems($, '.sect--hot a.poster').filter((item) => !this.containsItem(featured, item)).slice(0, 16)
        const topRated = this.parser.parseHomeItems($, '.side-block:has(.side-block__title:contains("Top-rated")) a.popular, .side-block__content--populars a.popular').filter((item) => !this.containsItem(featured, item)).slice(0, 16)
        const all = this.parser.parseHomeItems($, 'a.poster, a.popular')
        const latest = all
            .filter((item) => !this.containsItem(featured, item))
            .filter((item) => !this.containsItem(hot, item))
            .filter((item) => !this.containsItem(topRated, item))
            .slice(0, 16)

        this.sendHomeSection(sectionCallback, SECTION_IDS.FEATURED, 'Featured Comics', 'singleRowLarge', featured, true)
        this.sendHomeSection(sectionCallback, SECTION_IDS.HOT, 'Hot New Releases', 'singleRowNormal', hot, true)
        this.sendHomeSection(sectionCallback, SECTION_IDS.TOP_RATED, 'Top Rated Comics', 'singleRowNormal', topRated, true)
        this.sendHomeSection(sectionCallback, SECTION_IDS.LATEST, 'Latest Updates', 'doubleRow', latest, true)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: unknown): Promise<PagedResults> {
        const page = this.getPageFromMetadata(metadata)
        const url = this.getViewMoreUrl(homepageSectionId, page)
        const $ = await this.getCheerio(url)
        const results = this.parser.parseHomeItems($, 'a.poster, a.popular')

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
        const match = text.match(/Your query found\s+(\d+)\s+answers?\s*\(\s*Query results\s+(\d+)\s*-\s*(\d+)\s*\)/i)

        if (!match) return false

        const total = Number.parseInt(match[1], 10)
        const end = Number.parseInt(match[3], 10)

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
                        tags: [App.createTag({ id: this.slugify(details.publisher), label: details.publisher })]
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

    private getViewMoreUrl(homepageSectionId: string, page: number): string {
        if (homepageSectionId === SECTION_IDS.HOT || homepageSectionId === SECTION_IDS.LATEST) {
            return page <= 1 ? `${BATCAVE_DOMAIN}/comix/` : `${BATCAVE_DOMAIN}/comix/page/${page}/`
        }

        return page <= 1 ? BATCAVE_DOMAIN : `${BATCAVE_DOMAIN}/page/${page}/`
    }

    private containsItem(items: BatCaveSourceComic[], item: BatCaveSourceComic): boolean {
        return items.some((existing) => existing.comicId === item.comicId)
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

    private slugify(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    }

    private cleanText(value: string): string {
        return value.replace(/\s+/g, ' ').trim()
    }
}
