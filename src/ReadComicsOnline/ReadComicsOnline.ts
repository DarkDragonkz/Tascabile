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
import {
    ReadComicsOnlineChapter,
    ReadComicsOnlineComicDetails,
    ReadComicsOnlineParser,
    ReadComicsOnlineSourceComic
} from '../../lib/sources/ReadComicsOnline/ReadComicsOnlineParser'

const READ_COMICS_ONLINE_DOMAIN = 'https://readcomiconline.li'
const PLACEHOLDER_IMAGE = `${READ_COMICS_ONLINE_DOMAIN}/Content/images/logo.png`

const SECTION_IDS = {
    LATEST: 'latest'
} as const

export const ReadComicsOnlineInfo: SourceInfo = {
    version: '0.1.3',
    name: 'ReadComicsOnline',
    icon: 'icon.png',
    author: 'DarkDragonkz',
    description: 'Source for ReadComicsOnline.',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: READ_COMICS_ONLINE_DOMAIN,
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

export class ReadComicsOnline
    extends Source
    implements MangaProviding, ChapterProviding, HomePageSectionsProviding, SearchResultsProviding {

    private readonly parser = new ReadComicsOnlineParser()

    requestManager = App.createRequestManager({
        requestsPerSecond: 2,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    referer: `${READ_COMICS_ONLINE_DOMAIN}/`,
                    origin: READ_COMICS_ONLINE_DOMAIN,
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
        return `${READ_COMICS_ONLINE_DOMAIN}/Comic/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const $ = await this.getCheerio(this.getMangaShareUrl(mangaId))
        const details = this.parser.parseComicDetails($, mangaId)

        return this.createSourceManga(details)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const $ = await this.getCheerio(this.getMangaShareUrl(mangaId))
        const chapters = this.parser.parseChapters($, mangaId)

        return chapters.map((chapter: ReadComicsOnlineChapter) => this.createChapter(chapter))
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const $ = await this.getCheerio(`${READ_COMICS_ONLINE_DOMAIN}/Comic/${mangaId}/${chapterId}`)
        const details = this.parser.parseChapterDetails($, mangaId, chapterId)

        return App.createChapterDetails({
            id: details.id,
            mangaId: details.comicId,
            pages: details.pages
        })
    }

    async getSearchResults(query: SearchRequest, metadata: unknown): Promise<PagedResults> {
        const page = this.getPageFromMetadata(metadata)
        const keyword = query.title ?? ''
        const urls = [
            buildUrl(READ_COMICS_ONLINE_DOMAIN, '/Search/Comic', { keyword, page }),
            buildUrl(READ_COMICS_ONLINE_DOMAIN, '/ComicList', { keyword, page }),
            buildUrl(READ_COMICS_ONLINE_DOMAIN, '/Search', { keyword, page })
        ]

        for (const url of urls) {
            const $ = await this.getCheerio(url)
            const results = this.parser.parseSearchResults($)

            if (results.length > 0) {
                return App.createPagedResults({
                    results: results.map((result: ReadComicsOnlineSourceComic) => this.createPartialSourceManga(result)),
                    metadata: { page: page + 1 }
                })
            }
        }

        return App.createPagedResults({
            results: [],
            metadata: undefined
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.getCheerio(READ_COMICS_ONLINE_DOMAIN)
        const latestItems = this.parser.parseHomeLatestUpdates($).slice(0, 20)

        if (latestItems.length === 0) {
            return
        }

        sectionCallback(App.createHomeSection({
            id: SECTION_IDS.LATEST,
            title: 'Latest Updates',
            type: 'singleRowNormal',
            containsMoreItems: false,
            items: latestItems.map((item: ReadComicsOnlineSourceComic) => this.createPartialSourceManga(item))
        }))
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

    private createSourceManga(details: ReadComicsOnlineComicDetails): SourceManga {
        return App.createSourceManga({
            id: details.id,
            mangaInfo: App.createMangaInfo({
                image: details.image ?? PLACEHOLDER_IMAGE,
                titles: [details.title],
                desc: details.description ?? '',
                status: this.mapStatus(details.status),
                artist: details.artists.join(', '),
                author: details.writers.join(', '),
                tags: [
                    App.createTagSection({
                        id: 'genres',
                        label: 'Genres',
                        tags: details.genres.map((genre: string) => App.createTag({
                            id: genre.toLowerCase().replace(/\s+/g, '-'),
                            label: genre
                        }))
                    })
                ],
                additionalInfo: {
                    publisher: details.publisher ?? '',
                    year: details.year?.toString() ?? ''
                }
            })
        })
    }

    private createPartialSourceManga(comic: ReadComicsOnlineSourceComic): PartialSourceManga {
        return App.createPartialSourceManga({
            mangaId: comic.comicId,
            title: comic.title,
            image: comic.image ?? PLACEHOLDER_IMAGE,
            subtitle: comic.subtitle
        })
    }

    private createChapter(chapter: ReadComicsOnlineChapter): Chapter {
        return App.createChapter({
            id: chapter.id,
            name: chapter.name,
            chapNum: chapter.chapNum ?? 0,
            time: chapter.time
        })
    }

    private mapStatus(status?: string): string {
        switch ((status ?? '').toLowerCase()) {
            case 'ongoing':
                return 'ONGOING'
            case 'completed':
                return 'COMPLETED'
            case 'hiatus':
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

        return typeof page === 'number' && Number.isFinite(page) ? page : 1
    }
}
