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
import { READ_ALL_COMICS_DOMAIN, READ_ALL_COMICS_PLACEHOLDER_IMAGE } from '../../lib/sources/ReadAllComics/constants'
import {
    ReadAllComicsChapter,
    ReadAllComicsDetails,
    ReadAllComicsParser,
    ReadAllComicsSeries
} from '../../lib/sources/ReadAllComics/ReadAllComicsParser'

const SECTION_IDS = {
    LATEST: 'latest'
} as const

const READ_ALL_COMICS_USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

export const ReadAllComicsInfo: SourceInfo = {
    version: '0.1.0',
    name: 'ReadAllComics',
    icon: 'icon.png',
    author: 'DarkDragonkz',
    description: 'Source inglese per ReadAllComics.',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: READ_ALL_COMICS_DOMAIN,
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

export class ReadAllComics
    extends Source
    implements MangaProviding, ChapterProviding, HomePageSectionsProviding, SearchResultsProviding {

    private readonly parser = new ReadAllComicsParser()

    requestManager = App.createRequestManager({
        requestsPerSecond: 1,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    Referer: `${READ_ALL_COMICS_DOMAIN}/`,
                    Origin: READ_ALL_COMICS_DOMAIN,
                    'User-Agent': READ_ALL_COMICS_USER_AGENT,
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

    getMangaShareUrl(mangaId: string): string {
        return `${READ_ALL_COMICS_DOMAIN}/category/${mangaId}/`
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const $ = await this.getCheerio(this.getMangaShareUrl(mangaId))
        const details = this.parser.parseSeriesDetails($, mangaId)
        const series = this.parser.parseSeriesList($)[0]

        return this.createSourceManga({
            ...details,
            image: series?.image ?? details.image,
            publisher: series?.publisher ?? details.publisher,
            genres: series?.genres ?? details.genres,
            year: series?.year ?? details.year,
            issueCount: series?.issueCount ?? details.issueCount
        })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const $ = await this.getCheerio(this.getMangaShareUrl(mangaId))
        const chapters = this.parser.parseChapters($, mangaId)

        return chapters.map((chapter: ReadAllComicsChapter) => this.createChapter(chapter))
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const $ = await this.getCheerio(`${READ_ALL_COMICS_DOMAIN}/${chapterId}/`)
        const details = this.parser.parseChapterDetails($, mangaId, chapterId)

        return App.createChapterDetails({
            id: details.id,
            mangaId: details.mangaId,
            pages: details.pages
        })
    }

    async getSearchTags(): Promise<TagSection[]> {
        return []
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
        const url = buildUrl(READ_ALL_COMICS_DOMAIN, '/', {
            story: searchTitle,
            s: '',
            type: 'comic',
            paged: page > 1 ? page : undefined
        })

        const $ = await this.getCheerio(url)
        const results = this.parser.parseSeriesList($)

        return App.createPagedResults({
            results: results.map((result: ReadAllComicsSeries) => this.createPartialSourceManga(result)),
            metadata: results.length > 0
                ? { page: page + 1 }
                : undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.getCheerio(READ_ALL_COMICS_DOMAIN)
        const items = this.parser.parseSeriesList($).slice(0, 20)

        this.emitHomeSection(
            sectionCallback,
            SECTION_IDS.LATEST,
            'Latest series',
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
            ? READ_ALL_COMICS_DOMAIN
            : `${READ_ALL_COMICS_DOMAIN}/page/${page}/`

        const $ = await this.getCheerio(url)
        const results = this.parser.parseSeriesList($)

        return App.createPagedResults({
            results: results.map((result: ReadAllComicsSeries) => this.createPartialSourceManga(result)),
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

    private createSourceManga(details: ReadAllComicsDetails): SourceManga {
        const descriptionParts = [
            details.description,
            details.publisher ? `Publisher: ${details.publisher}` : '',
            details.year ? `Year: ${details.year}` : '',
            details.issueCount ? `Issues: ${details.issueCount}` : ''
        ].filter(Boolean)

        return App.createSourceManga({
            id: details.id,
            mangaInfo: App.createMangaInfo({
                image: details.image ?? READ_ALL_COMICS_PLACEHOLDER_IMAGE,
                titles: [details.title].filter(Boolean),
                desc: descriptionParts.join('\n'),
                status: 'UNKNOWN',
                artist: '',
                author: '',
                tags: [
                    App.createTagSection({
                        id: 'genres',
                        label: 'Genres',
                        tags: details.genres.map((genre: string) => App.createTag({
                            id: genre.toLowerCase().replace(/\s+/g, '-'),
                            label: genre
                        }))
                    })
                ]
            })
        })
    }

    private createPartialSourceManga(series: ReadAllComicsSeries): PartialSourceManga {
        return App.createPartialSourceManga({
            mangaId: series.mangaId,
            title: series.title,
            image: series.image ?? READ_ALL_COMICS_PLACEHOLDER_IMAGE,
            subtitle: series.subtitle
        })
    }

    private createChapter(chapter: ReadAllComicsChapter): Chapter {
        return App.createChapter({
            id: chapter.id,
            name: chapter.name,
            chapNum: chapter.chapNum ?? 0,
            volume: chapter.volume,
            time: chapter.time
        })
    }

    private emitHomeSection(
        sectionCallback: (section: HomeSection) => void,
        id: string,
        title: string,
        type: 'singleRowLarge' | 'singleRowNormal',
        containsMoreItems: boolean,
        items: ReadAllComicsSeries[]
    ): void {
        if (items.length === 0) {
            return
        }

        sectionCallback(App.createHomeSection({
            id,
            title,
            type,
            containsMoreItems,
            items: items.map((item: ReadAllComicsSeries) => this.createPartialSourceManga(item))
        }))
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
