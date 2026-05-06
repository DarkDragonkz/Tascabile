import {
    App,
    Chapter,
    ChapterDetails,
    HomeSection,
    Manga,
    PagedResults,
    PartialSourceManga,
    SearchRequest,
    Source,
    TagSection
} from '@paperback/types'

import { MangaWorldParser } from '../../lib/sources/MangaWorld/MangaWorldParser'

const BASE_URL = 'https://www.mangaworld.mx'

const SECTION_IDS = {
    TRENDING: 'mw_trending',
    LATEST: 'mw_latest',
    NEWEST: 'mw_newest'
} as const

export class MangaWorld extends Source {
    override readonly name = 'MangaWorld'
    override readonly description = 'MangaWorld source for Paperback'
    override readonly icon = 'icon.png'
    override readonly websiteBaseURL = BASE_URL
    override readonly version = '0.1.0'

    private readonly parser = new MangaWorldParser()

    private readonly requestManager = App.createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: any): Promise<any> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    referer: BASE_URL,
                    origin: BASE_URL,
                    'user-agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    accept:
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
                    'cache-control': 'no-cache',
                    pragma: 'no-cache'
                }

                return request
            },
            interceptResponse: async (response: any): Promise<any> => response
        }
    })

    constructor(cheerio: any) {
        super(cheerio)
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const keyword = encodeURIComponent(query?.title ?? '')
        const includedTags = (query?.includedTags ?? [])
            .map((tag: any) => `genre=${encodeURIComponent(tag.id)}`)
            .join('&')

        const queryParts = [
            keyword ? `keyword=${keyword}` : '',
            includedTags,
            page > 1 ? `page=${page}` : ''
        ].filter(Boolean)

        const url = `${BASE_URL}/archive${queryParts.length > 0 ? `?${queryParts.join('&')}` : ''}`
        const $ = await this.fetchCheerio(url)

        const results = this.parser.parseSearchResults($)

        return App.createPagedResults({
            results: results.map((result: any) => this.createPartialSourceManga(result)),
            metadata: results.length > 0 ? { page: page + 1 } : undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const trendingSection = App.createHomeSection({
            id: SECTION_IDS.TRENDING,
            title: 'In tendenza',
            type: 'singleRowLarge',
            containsMoreItems: true
        })

        const latestSection = App.createHomeSection({
            id: SECTION_IDS.LATEST,
            title: 'Aggiornati di recente',
            type: 'doubleRow',
            containsMoreItems: true
        })

        const newestSection = App.createHomeSection({
            id: SECTION_IDS.NEWEST,
            title: 'Ultime aggiunte',
            type: 'singleRowNormal',
            containsMoreItems: true
        })

        sectionCallback(trendingSection)
        sectionCallback(latestSection)
        sectionCallback(newestSection)

        const [trendingItems, latestItems, newestItems] = await Promise.all([
            this.getHomeSectionItemsForUrl(`${BASE_URL}/archive?sort=most_read`, 12),
            this.getHomeSectionItemsForUrl(`${BASE_URL}/archive?sort=updated`, 18),
            this.getHomeSectionItemsForUrl(`${BASE_URL}/archive?sort=newest`, 12)
        ])

        trendingSection.items = trendingItems.map((item: any) => this.createPartialSourceManga(item))
        latestSection.items = latestItems.map((item: any) => this.createPartialSourceManga(item))
        newestSection.items = newestItems.map((item: any) => this.createPartialSourceManga(item))

        sectionCallback(trendingSection)
        sectionCallback(latestSection)
        sectionCallback(newestSection)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1

        let url: string
        switch (homepageSectionId) {
            case SECTION_IDS.TRENDING:
                url = `${BASE_URL}/archive?sort=most_read&page=${page}`
                break
            case SECTION_IDS.LATEST:
                url = `${BASE_URL}/archive?sort=updated&page=${page}`
                break
            case SECTION_IDS.NEWEST:
                url = `${BASE_URL}/archive?sort=newest&page=${page}`
                break
            default:
                return App.createPagedResults({
                    results: [],
                    metadata: undefined
                })
        }

        const $ = await this.fetchCheerio(url)
        const results = this.parser.parseSearchResults($)

        return App.createPagedResults({
            results: results.map((result: any) => this.createPartialSourceManga(result)),
            metadata: results.length > 0 ? { page: page + 1 } : undefined
        })
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {
        const $ = await this.fetchCheerio(`${BASE_URL}/manga/${mangaId}`)
        const details = this.parser.parseMangaDetails($, mangaId)

        const tagSections: TagSection[] = [
            App.createTagSection({
                id: 'genres',
                label: 'Generi',
                tags: (details.tags ?? []).map((tag: any) =>
                    App.createTag({
                        id: tag.id,
                        label: tag.label
                    })
                )
            })
        ]

        return App.createManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                image: details.image ?? '',
                titles: [details.title, ...(details.altTitles ?? [])],
                desc: details.description ?? '',
                status: details.status ?? 'ONGOING',
                artist: Array.isArray(details.artist) ? details.artist.join(', ') : (details.artist ?? ''),
                author: Array.isArray(details.author) ? details.author.join(', ') : (details.author ?? ''),
                tags: tagSections
            })
        })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const $ = await this.fetchCheerio(`${BASE_URL}/manga/${mangaId}`)
        const chapters = this.parser.parseChapters($, mangaId)

        return chapters.map((chapter: any) => this.createChapter(chapter))
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const $ = await this.fetchCheerio(`${BASE_URL}/manga/${mangaId}/read/${chapterId}/1?style=list`)
        const details = this.parser.parseChapterDetails($, mangaId, chapterId)

        return App.createChapterDetails({
            id: chapterId,
            mangaId,
            pages: details.pages ?? [],
            longStrip: false
        })
    }

    async getTags(): Promise<TagSection[]> {
        const $ = await this.fetchCheerio(`${BASE_URL}/archive`)
        const tags = this.parser.parseTags($)

        return [
            App.createTagSection({
                id: 'genres',
                label: 'Generi',
                tags: tags.map((tag: any) =>
                    App.createTag({
                        id: tag.id,
                        label: tag.label
                    })
                )
            })
        ]
    }

    private async getHomeSectionItemsForUrl(url: string, limit: number): Promise<any[]> {
        const $ = await this.fetchCheerio(url)
        const results = this.parser.parseSearchResults($)
        return results.slice(0, limit)
    }

    private async fetchCheerio(url: string): Promise<any> {
        const request = App.createRequest({
            url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request)
        return this.cheerio.load(response.data)
    }

    private createPartialSourceManga(manga: any): PartialSourceManga {
        return App.createPartialSourceManga({
            mangaId: manga.mangaId,
            title: manga.title,
            image: manga.image ?? '',
            subtitle: manga.subtitle ?? manga.secondaryText ?? undefined
        })
    }

    private createChapter(chapter: any): Chapter {
        return App.createChapter({
            id: chapter.id,
            chapNum: chapter.chapNum ?? 0,
            volume: chapter.volume,
            name: chapter.name,
            time: chapter.time
        })
    }
}
