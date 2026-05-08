import type { CheerioAPI } from 'cheerio'
import { BATCAVE_DOMAIN } from './constants'

export interface BatCaveHomeItem {
    comicId: string
    title: string
    image?: string
    subtitle?: string
}

export class BatCaveParser {
    parseFeaturedHomeItems($: CheerioAPI): BatCaveHomeItem[] {
        return this.parsePosterItems($, '.owl-stage a.poster, .owl-stage-outer a.poster, .sect--popular a.poster, #owl-carou a.poster, a.poster.grid-item.has-overlay')
    }

    parsePosterItems($: CheerioAPI, selector: string): BatCaveHomeItem[] {
        const items: BatCaveHomeItem[] = []
        const seen = new Set<string>()

        $(selector).each((_: number, element: any) => {
            const anchor = $(element)
            const comicId = this.extractComicId(anchor.attr('href'))
            const imageElement = anchor.find('img').first()
            const title = this.cleanText(anchor.find('.poster__title').first().text()) || this.cleanText(imageElement.attr('alt'))

            if (!comicId || !title || seen.has(comicId)) return

            const subtitleParts = anchor
                .find('.poster__subtitle li')
                .map((__: number, item: any) => this.cleanText($(item).text()))
                .get()
                .filter(Boolean)
            const subtitle = subtitleParts.join(' • ')

            seen.add(comicId)
            items.push({
                comicId,
                title,
                image: this.extractImageUrl(imageElement),
                subtitle: subtitle || undefined
            })
        })

        return items
    }

    private extractComicId(url?: string): string | undefined {
        if (!url) return undefined

        const pathname = url
            .replace(BATCAVE_DOMAIN, '')
            .split('#')[0]
            .split('?')[0]
            .replace(/^\//, '')

        if (!pathname.endsWith('.html')) return undefined

        return pathname
    }

    private extractImageUrl(element: any): string | undefined {
        const candidates = [
            element.attr('data-src'),
            element.attr('data-lazy-src'),
            element.attr('data-original'),
            element.attr('src')
        ]

        for (const candidate of candidates) {
            const url = this.absoluteUrl(candidate)

            if (url && !url.startsWith('data:image/')) return url
        }

        return undefined
    }

    private absoluteUrl(url?: string): string | undefined {
        if (!url) return undefined

        if (url.startsWith('//')) return `https:${url}`
        if (url.startsWith('/')) return `${BATCAVE_DOMAIN}${url}`

        return url
    }

    private cleanText(value?: string): string {
        return (value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    }
}
