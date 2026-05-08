import {
    BadgeColor,
    ContentRating,
    HomePageSectionsProviding,
    HomeSection,
    PartialSourceManga,
    Request,
    Response,
    Source,
    SourceInfo,
    SourceIntents
} from '@paperback/types'
import type { CheerioAPI } from 'cheerio'
import { BATCAVE_DOMAIN, BATCAVE_PLACEHOLDER_IMAGE } from '../../lib/sources/BatCave/constants'
import { BatCaveHomeItem, BatCaveParser } from '../../lib/sources/BatCave/BatCaveParser'

const SECTION_IDS = {
    FEATURED: 'featured'
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
        { text: 'English', type: BadgeColor.GREY },
        { text: 'Comics', type: BadgeColor.BLUE }
    ],
    intents: SourceIntents.HOMEPAGE_SECTIONS
}

export class BatCave extends Source implements HomePageSectionsProviding {
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

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.getCheerio(BATCAVE_DOMAIN)
        const featuredItems = this.parser.parseFeaturedHomeItems($).slice(0, 16)

        if (featuredItems.length === 0) return

        sectionCallback(App.createHomeSection({
            id: SECTION_IDS.FEATURED,
            title: 'Featured Comics',
            type: 'singleRowLarge',
            containsMoreItems: false,
            items: featuredItems.map((item: BatCaveHomeItem) => this.createPartialSourceManga(item))
        }))
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

    private createPartialSourceManga(item: BatCaveHomeItem): PartialSourceManga {
        return App.createPartialSourceManga({
            mangaId: item.comicId,
            title: item.title,
            image: item.image ?? BATCAVE_PLACEHOLDER_IMAGE,
            subtitle: item.subtitle
        })
    }
}
