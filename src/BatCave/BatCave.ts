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

const FALLBACK_SEARCH_PAGE_SIZE = 10

export const BatCaveInfo: SourceInfo = {
    version: '0.1.11',
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
        const searchTitle = this.getSearchTitle(query)
        const includedTags = query.includedTags?.map(tag => tag.label).filter(Boolean) ?? []
        const searchTerms = [searchTitle, ...includedTags].filter(Boolean).join(' ').trim()

        if (!searchTerms) {
            return App.createPagedResults({
                results: [],
                metadata: undefined
            })
        }

        const liveResults = await this.getLiveSearchResults(searchTerms, page)

        if (liveResults.length > 0) {
            return App.createPagedResults({
                results: liveResults.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
                metadata: { page: page + 1 }
            })
        }

        const fallbackResults = this.getFallbackSearchResultsPage(searchTerms, page)

        return App.createPagedResults({
            results: fallbackResults.results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
            metadata: fallbackResults.hasMore
                ? { page: page + 1 }
                : undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const fallbackSections = this.getFallbackHomeSections()

        try {
            const $ = await this.getCheerio(BATCAVE_DOMAIN)
            const allItems = this.dedupeItems(this.parser.parseHomeItems($, 'a.poster.grid-item.has-overlay, a.poster, a.popular'))

            const featuredItems = this.dedupeItems(this.parser.parseHomeItems(
                $,
                '.owl-stage a.poster, .owl-stage-outer a.poster, a.poster[data-hot_marker]'
            )).slice(0, 15)

            const hotItems = this.dedupeItems(this.parser.parseHomeItems(
                $,
                '.sect--hot a.poster, .sect__content a.poster'
            ))
                .filter((item: BatCaveSourceComic) => !featuredItems.some((featured: BatCaveSourceComic) => featured.comicId === item.comicId))
                .slice(0, 15)

            const topRatedItems = this.dedupeItems(this.parser.parseHomeItems(
                $,
                '.side-block__content--populars a.popular, a.popular'
            ))
                .filter((item: BatCaveSourceComic) => !featuredItems.some((featured: BatCaveSourceComic) => featured.comicId === item.comicId))
                .filter((item: BatCaveSourceComic) => !hotItems.some((hot: BatCaveSourceComic) => hot.comicId === item.comicId))
                .slice(0, 15)

            const latestItems = allItems
                .filter((item: BatCaveSourceComic) => !featuredItems.some((featured: BatCaveSourceComic) => featured.comicId === item.comicId))
                .filter((item: BatCaveSourceComic) => !hotItems.some((hot: BatCaveSourceComic) => hot.comicId === item.comicId))
                .filter((item: BatCaveSourceComic) => !topRatedItems.some((topRated: BatCaveSourceComic) => topRated.comicId === item.comicId))
                .slice(0, 15)

            this.sendHomeSection(sectionCallback, SECTION_IDS.FEATURED, 'Featured Comics', 'singleRowLarge', featuredItems.length > 0 ? featuredItems : allItems.slice(0, 15), true)
            this.sendHomeSection(sectionCallback, SECTION_IDS.HOT, 'Hot New Releases', 'singleRowNormal', hotItems.length > 0 ? hotItems : allItems.slice(15, 30), true)
            this.sendHomeSection(sectionCallback, SECTION_IDS.TOP_RATED, 'Top Rated Comics', 'singleRowNormal', topRatedItems.length > 0 ? topRatedItems : allItems.slice(30, 45), true)
            this.sendHomeSection(sectionCallback, SECTION_IDS.LATEST, 'Latest Updates', 'doubleRow', latestItems.length > 0 ? latestItems : allItems.slice(45, 60), true)

            if (allItems.length > 0 || featuredItems.length > 0 || hotItems.length > 0 || topRatedItems.length > 0) {
                return
            }
        } catch {
            // Fall through to deterministic fallback below.
        }

        this.sendHomeSection(sectionCallback, SECTION_IDS.FEATURED, 'Featured Comics', 'singleRowLarge', fallbackSections.featured, true)
        this.sendHomeSection(sectionCallback, SECTION_IDS.HOT, 'Hot New Releases', 'singleRowNormal', fallbackSections.hot, true)
        this.sendHomeSection(sectionCallback, SECTION_IDS.TOP_RATED, 'Top Rated Comics', 'singleRowNormal', fallbackSections.topRated, true)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: unknown): Promise<PagedResults> {
        const page = this.getPageFromMetadata(metadata)
        const fallbackSections = this.getFallbackHomeSections()

        if (page === 1) {
            return App.createPagedResults({
                results: this.getFallbackItemsForSection(homepageSectionId, fallbackSections)
                    .map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
                metadata: undefined
            })
        }

        const url = `${BATCAVE_DOMAIN}/page/${page}/`
        const $ = await this.getCheerio(url)
        const results = this.dedupeItems(this.parser.parseHomeItems($, 'a.poster.grid-item.has-overlay, a.poster, a.popular'))

        return App.createPagedResults({
            results: results.map((result: BatCaveSourceComic) => this.createPartialSourceManga(result)),
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

    private async getLiveSearchResults(searchTerms: string, page: number): Promise<BatCaveSourceComic[]> {
        const primaryUrl = `${BATCAVE_DOMAIN}/index.php?do=search&subaction=search&story=${encodeURIComponent(searchTerms)}&search_start=${page}`
        const fallbackUrl = `${BATCAVE_DOMAIN}/search/${encodeURIComponent(searchTerms)}`
        const primaryResults = await this.getSearchResultsFromUrl(primaryUrl)

        if (primaryResults.length > 0 || page > 1) {
            return primaryResults
        }

        return this.getSearchResultsFromUrl(fallbackUrl)
    }

    private async getSearchResultsFromUrl(url: string): Promise<BatCaveSourceComic[]> {
        try {
            const $ = await this.getCheerio(url)

            return this.parser.parseSearchResults($)
        } catch {
            return []
        }
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

        sectionCallback(App.createHomeSection({
            id,
            title,
            type,
            containsMoreItems,
            items: items.map((item: BatCaveSourceComic) => this.createPartialSourceManga(item))
        }))
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

    private getSearchTitle(query: SearchRequest): string {
        const queryWithFallbacks = query as SearchRequest & {
            query?: string
            searchTerm?: string
            text?: string
        }

        return query.title
            ?? queryWithFallbacks.query
            ?? queryWithFallbacks.searchTerm
            ?? queryWithFallbacks.text
            ?? ''
    }

    private getFallbackSearchResultsPage(searchTerms: string, page: number): { results: BatCaveSourceComic[]; hasMore: boolean } {
        const allResults = this.getFallbackSearchResults(searchTerms)
        const offset = (page - 1) * FALLBACK_SEARCH_PAGE_SIZE
        const results = allResults.slice(offset, offset + FALLBACK_SEARCH_PAGE_SIZE)

        return {
            results,
            hasMore: offset + FALLBACK_SEARCH_PAGE_SIZE < allResults.length
        }
    }

    private getFallbackSearchResults(searchTerms: string): BatCaveSourceComic[] {
        const normalizedSearch = this.normalizeSearchValue(searchTerms)
        const items = [
            ...this.getFallbackHomeSections().featured,
            ...this.getFallbackHomeSections().hot,
            ...this.getFallbackHomeSections().topRated,
            ...this.getFallbackTheBoysSearchResults()
        ]

        return this.dedupeItems(items)
            .filter((item: BatCaveSourceComic) => this.normalizeSearchValue(item.title).includes(normalizedSearch))
    }

    private getFallbackTheBoysSearchResults(): BatCaveSourceComic[] {
        return [
            { comicId: '5629-the-boys-2006-2012.html', title: 'The Boys (2006-2012)', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/68/a134c2dc30a8bf16922095b4989fb4.webp`, subtitle: 'The Boys (2006-2012) #Omnibus Vol. 6' },
            { comicId: '27657-the-boys-herogasm-2009.html', title: 'The Boys: Herogasm (2009)', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/66/6f4afd212cea540df36163e5de0516.webp`, subtitle: 'The Boys: Herogasm Issue #6' },
            { comicId: '27655-the-boys-omnibus-2019.html', title: 'The Boys Omnibus (2019-)', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/ff/c453990f0822ed10d881d451211104.webp`, subtitle: 'The Boys Omnibus TPB 6' },
            { comicId: '5630-the-boys-dear-becky-2020.html', title: 'The Boys: Dear Becky (2020-)', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/62/40cd2837a2cf1b7e549a82a0113448.webp`, subtitle: 'The Boys: Dear Becky #8' },
            { comicId: '27656-the-boys-butcher-baker-candlestickmaker-2011.html', title: 'The Boys: Butcher, Baker, Candlestickmaker (2011)', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/99/954784273e3b984a49625ab2808fd4.webp`, subtitle: 'The Boys: Butcher, Baker, Candlestickmaker Issue #6' },
            { comicId: '27658-the-boys-highland-laddie-2010-2011.html', title: 'The Boys: Highland Laddie (2010-2011)', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/19/dad20da66f4e999a0d4a52d371878e.webp`, subtitle: 'The Boys: Highland Laddie TPB' },
            { comicId: '27654-the-boys-of-sheriff-street-2016.html', title: 'The Boys of Sheriff Street (2016-)', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/f0/3629eaf170aca775da499203ad92ee.webp`, subtitle: 'The Boys of Sheriff Street TPB' },
            { comicId: '29375-the-three-stooges-the-boys-are-back-2016.html', title: 'The Three Stooges: The Boys Are Back (2016-)', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/7a/3727f4538e80c0db77b31235f5cfb4.webp`, subtitle: 'The Three Stooges: The Boys Are Back Full' },
            { comicId: '33593-please-login-or-register-adv-search-imgsearchclickfunction-submit-var-delay-function-var-timer-0-return-function-callback-ms-cleartimeouttimer-timer.html', title: 'The Boys', image: `${BATCAVE_DOMAIN}/uploads/mini/100x150/0b/d764d3741a6432b6c8d5eaade025ae.webp`, subtitle: 'The Boys Issue #72' },
            { comicId: '12291-crossed.html', title: 'Crossed', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/ef/b05f57d255b6f94067748feee2d082.jpg`, subtitle: 'Avatar Press • 2008' },
            { comicId: '6975-invincible-2003.html', title: 'Invincible (2003)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/25/f6a2dd4c3708ea1519f0ac28084790.jpg`, subtitle: 'Top Rated' },
            { comicId: '33051-absolute-batman-2024.html', title: 'Absolute Batman (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/6e/fdb398ba48cfbe9c2b9c2fa9a917af.jpg`, subtitle: 'Top Rated' }
        ]
    }

    private normalizeSearchValue(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    }

    private getFallbackItemsForSection(
        homepageSectionId: string,
        fallbackSections: { featured: BatCaveSourceComic[]; hot: BatCaveSourceComic[]; topRated: BatCaveSourceComic[] }
    ): BatCaveSourceComic[] {
        switch (homepageSectionId) {
            case SECTION_IDS.FEATURED:
                return fallbackSections.featured
            case SECTION_IDS.HOT:
                return fallbackSections.hot
            case SECTION_IDS.TOP_RATED:
                return fallbackSections.topRated
            default:
                return [...fallbackSections.featured, ...fallbackSections.hot, ...fallbackSections.topRated]
        }
    }

    private getFallbackHomeSections(): { featured: BatCaveSourceComic[]; hot: BatCaveSourceComic[]; topRated: BatCaveSourceComic[] } {
        return {
            featured: [
                { comicId: '32394-ultimate-spider-man-2024.html', title: 'Ultimate Spider-Man (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/55/98c052976e162080e5a0be8c9fb31f.jpg`, subtitle: 'Marvel Comics • 2024' },
                { comicId: '2395-green-lantern.html', title: 'Green Lantern (2023-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/b9/4d6b2820842cc41b14d14b6720c0f3.jpg`, subtitle: 'DC Comics • 2023' },
                { comicId: '99-action-comics.html', title: 'Action Comics (2016-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/50/7c571952a923d6495c3a5e9809c9cf.jpg`, subtitle: 'DC Comics • 2016' },
                { comicId: '33124-batgirl-2024.html', title: 'Batgirl (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/91/bc114b5aea67915050dc331be3db9c.jpg`, subtitle: 'DC Comics • 2024' },
                { comicId: '33524-invincible-universe-battle-beast-2025.html', title: 'Invincible Universe: Battle Beast (2025-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/ab/d52803037615cc2d8fe030ea3434bd.jpg`, subtitle: 'Image Comics • 2025' },
                { comicId: '32886-uncanny-x-men-2024.html', title: 'Uncanny X-Men (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/1f/f89c248846ebadf94bf34ace5f9c7f.jpg`, subtitle: 'Marvel Comics • 2024' },
                { comicId: '33961-the-infernal-hulk-2025.html', title: 'The Infernal Hulk (2025-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/37/2e907aa11d44bb0840ede04aec27a1.jpg`, subtitle: 'Marvel Comics • 2025' },
                { comicId: '34198-vampirella-2026.html', title: 'Vampirella (2026-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/cd/7ad36fcdf7aecf25d57aacae7e7f84.jpg`, subtitle: 'Dynamite • 2026' },
                { comicId: '561-batman.html', title: 'Batman (2016-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/4b/dae2e9e22424adf4d9fb04b0085f2d.jpg`, subtitle: 'DC Comics • 2016' },
                { comicId: '4353-radiant-black.html', title: 'Radiant Black (2021-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/ea/1ff13ab8f8c5cbcc7afa878dc88bf3.jpg`, subtitle: 'Image Comics • 2021' }
            ],
            hot: [
                { comicId: '6968-the-flash-2023.html', title: 'The Flash (2023-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/2b/2f713acd4e7679687de07b8e1fd287.jpg`, subtitle: 'DC Comics • 2023' },
                { comicId: '12291-crossed.html', title: 'Crossed', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/ef/b05f57d255b6f94067748feee2d082.jpg`, subtitle: 'Avatar Press • 2008' },
                { comicId: '33443-absolute-green-lantern-2025.html', title: 'Absolute Green Lantern (2025-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/51/35d45a8a112d6f7afadf06c9dab15b.jpg`, subtitle: 'DC Comics • 2025' },
                { comicId: '29560-the-walking-dead-2003-2019.html', title: 'The Walking Dead (2003-2019)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/12/06d5d96987207a979bbde6d346c403.jpg`, subtitle: 'Image Comics • 2003' },
                { comicId: '34106-the-punisher-2026.html', title: 'The Punisher (2026-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/aa/0eeb7f3dba4c159c532211c09df3db.jpg`, subtitle: 'Marvel Comics • 2026' },
                { comicId: '34138-new-titans-2026.html', title: 'New Titans (2026-)', image: `${BATCAVE_DOMAIN}/uploads/mini/142x212/7a/bbfbb9dc60f29420256ca8bb3b8601.jpg`, subtitle: 'DC Comics • 2026' }
            ],
            topRated: [
                { comicId: '6975-invincible-2003.html', title: 'Invincible (2003)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/25/f6a2dd4c3708ea1519f0ac28084790.jpg`, subtitle: 'Top Rated' },
                { comicId: '33051-absolute-batman-2024.html', title: 'Absolute Batman (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/6e/fdb398ba48cfbe9c2b9c2fa9a917af.jpg`, subtitle: 'Top Rated' },
                { comicId: '2913-invincible-compendium.html', title: 'Invincible Compendium (2011-2018)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/6c/e9e3eabcf5e389cdc0ed9765c2c6bd.jpg`, subtitle: 'Top Rated' },
                { comicId: '5629-the-boys-2006-2012.html', title: 'The Boys (2006-2012)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/56/8b8e7405896d1bd972611d99867242.jpg`, subtitle: 'Top Rated' },
                { comicId: '33091-absolute-wonder-woman-2024.html', title: 'Absolute Wonder Woman (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/ba/76324421848a62b04c1b8bcc23d804.jpg`, subtitle: 'Top Rated' },
                { comicId: '33086-absolute-superman-2024.html', title: 'Absolute Superman (2024-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/5d/bf79030427e02aa2166444c2c970df.jpg`, subtitle: 'Top Rated' },
                { comicId: '16696-transformers-2023.html', title: 'Transformers (2023-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/ff/5c40b3fc7d129aec035793086ad65a.jpg`, subtitle: 'Top Rated' },
                { comicId: '33758-batman-2025.html', title: 'Batman (2025-)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/b5/ed483acd9b2961caf09b703e067485.jpg`, subtitle: 'Top Rated' },
                { comicId: '6966-the-amazing-spider-man-1963.html', title: 'The Amazing Spider-Man (1963)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/a6/a91fa781764a6cce032da3059d4aa7.jpg`, subtitle: 'Top Rated' },
                { comicId: '33450-the-amazing-spider-man-2025.html', title: 'The Amazing Spider-Man (2025)', image: `${BATCAVE_DOMAIN}/uploads/mini/64x96/47/fd7af15c340d0866eeae9ca7910fcc.jpg`, subtitle: 'Top Rated' }
            ]
        }
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
