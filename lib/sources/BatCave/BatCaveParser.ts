import type { CheerioAPI } from 'cheerio'
import { BATCAVE_DOMAIN } from './constants'

export interface BatCaveSourceComic {
    comicId: string
    title: string
    image?: string
    subtitle?: string
}

export interface BatCaveComicDetails {
    id: string
    title: string
    image?: string
    description?: string
    publisher?: string
    status?: string
    year?: number
    chapters: BatCaveChapter[]
}

export interface BatCaveChapter {
    id: string
    comicId: string
    name: string
    chapNum?: number
    time?: Date
}

export interface BatCaveChapterDetails {
    id: string
    comicId: string
    pages: string[]
}

interface JsonLdNode {
    '@type'?: string | string[]
    '@graph'?: JsonLdNode[]
    '@id'?: string
    url?: string
    name?: string
    image?: string
    thumbnailUrl?: string
    description?: string
    publisher?: { name?: string; '@id'?: string } | string
    startDate?: string
    datePublished?: string
    dateCreated?: string
    hasPart?: {
        itemListElement?: Array<{
            position?: number
            item?: JsonLdNode
        }>
    }
    identifier?: Array<{
        propertyID?: string
        value?: string | number
    }>
    pageEnd?: number
}

interface BatCaveReaderData {
    chapters?: Array<{
        id?: number
        title?: string
        title_en?: string
    }>
    images?: string[]
}

export class BatCaveParser {
    parseHomeItems($: CheerioAPI, selector = '.poster.grid-item.has-overlay'): BatCaveSourceComic[] {
        return this.parsePosterItems($, selector)
    }

    parseSearchResults($: CheerioAPI): BatCaveSourceComic[] {
        const results: BatCaveSourceComic[] = []
        const seen = new Set<string>()

        $('.readed.d-flex.short').each((_: number, element: any) => {
            const link = $(element).find('.readed__title a[href]').first()
            const href = link.attr('href') || $(element).find('a[href$=".html"]').first().attr('href')
            const comicId = this.extractComicId(href)
            const title = this.cleanText(link.text()) || this.cleanText($(element).find('img').first().attr('alt'))

            if (!comicId || !title || seen.has(comicId)) {
                return
            }

            const meta = $(element)
                .find('.readed__meta-item')
                .map((__: number, metaElement: any) => this.cleanText($(metaElement).text()))
                .get()
                .filter(Boolean)

            const lastIssue = this.cleanText($(element).find('.readed__info li').last().text().replace(/^Last issue:\s*/i, ''))

            seen.add(comicId)
            results.push({
                comicId,
                title,
                image: this.absoluteUrl(
                    $(element).find('img').first().attr('data-src')
                        || $(element).find('img').first().attr('src')
                ),
                subtitle: lastIssue || meta.join(' • ') || undefined
            })
        })

        return results
    }

    parseComicDetails($: CheerioAPI, fallbackComicId: string): BatCaveComicDetails {
        const series = this.findJsonLdNode($, 'ComicSeries')
        const comicId = this.extractComicId(series?.url) || fallbackComicId
        const title = this.cleanText(series?.name) || this.cleanText($('h1').first().text()) || comicId
        const publisher = this.extractPublisherName($, series)
        const year = this.parseYear(series?.startDate) || this.parseYear(this.cleanText($('.page__list li').first().text()))
        const chapters = this.parseChaptersFromSeries(series, comicId)

        return {
            id: comicId,
            title,
            image: this.absoluteUrl(series?.image || series?.thumbnailUrl || $('.page__poster img').first().attr('src')),
            description: this.cleanText(series?.description) || this.cleanText($('.page__text').first().text()),
            publisher: publisher || this.extractListValue($, 'Publisher'),
            status: this.extractListValue($, 'Release type'),
            year,
            chapters
        }
    }

    parseChapters($: CheerioAPI, fallbackComicId: string): BatCaveChapter[] {
        const series = this.findJsonLdNode($, 'ComicSeries')
        const comicId = this.extractComicId(series?.url) || fallbackComicId
        const jsonLdChapters = this.parseChaptersFromSeries(series, comicId)

        if (jsonLdChapters.length > 0) {
            return jsonLdChapters
        }

        const chapters: BatCaveChapter[] = []
        const seen = new Set<string>()

        $('a[href*="/reader/"]').each((_: number, element: any) => {
            const href = $(element).attr('href')
            const parsed = this.extractReaderIds(href)
            const name = this.cleanText($(element).text()) || this.cleanText($(element).attr('title'))

            if (!parsed || parsed.comicNumericId !== this.extractNumericId(comicId) || !name || seen.has(parsed.chapterId)) {
                return
            }

            seen.add(parsed.chapterId)
            chapters.push({
                id: parsed.chapterId,
                comicId,
                name,
                chapNum: this.parseChapterNumber(name)
            })
        })

        return chapters
    }

    parseChapterDetails($: CheerioAPI, comicId: string, chapterId: string): BatCaveChapterDetails {
        const readerData = this.parseReaderData($)
        const jsonLdIssue = this.findJsonLdNode($, 'ComicIssue')
        const images = readerData.images ?? []
        const seen = new Set<string>()
        const pages: string[] = []

        for (const image of images) {
            const page = this.absoluteUrl(image)

            if (!page || seen.has(page)) {
                continue
            }

            seen.add(page)
            pages.push(page)
        }

        if (pages.length === 0) {
            const image = this.absoluteUrl(jsonLdIssue?.image || $('#ssr-shell img').first().attr('src'))

            if (image) {
                pages.push(image)
            }
        }

        return {
            id: chapterId,
            comicId,
            pages
        }
    }

    private parsePosterItems($: CheerioAPI, selector: string): BatCaveSourceComic[] {
        const results: BatCaveSourceComic[] = []
        const seen = new Set<string>()

        $(selector).each((_: number, element: any) => {
            const link = $(element).is('a')
                ? $(element)
                : $(element).find('a[href$=".html"]').first()
            const comicId = this.extractComicId(link.attr('href'))
            const title = this.cleanText($(element).find('.poster__title').first().text())
                || this.cleanText($(element).find('img').first().attr('alt'))
                || this.cleanText(link.text())

            if (!comicId || !title || seen.has(comicId)) {
                return
            }

            const subtitle = $(element)
                .find('.poster__subtitle li')
                .map((__: number, item: any) => this.cleanText($(item).text()))
                .get()
                .filter(Boolean)
                .join(' • ')

            seen.add(comicId)
            results.push({
                comicId,
                title,
                image: this.absoluteUrl(
                    $(element).find('img').first().attr('data-src')
                        || $(element).find('img').first().attr('src')
                ),
                subtitle: subtitle || undefined
            })
        })

        return results
    }

    private parseChaptersFromSeries(series: JsonLdNode | undefined, comicId: string): BatCaveChapter[] {
        const elements = series?.hasPart?.itemListElement ?? []

        return elements
            .map((element) => {
                const item = element.item
                const parsed = this.extractReaderIds(item?.url)
                const name = this.cleanText(item?.name)

                if (!item || !parsed || !name) {
                    return undefined
                }

                return {
                    id: parsed.chapterId,
                    comicId,
                    name,
                    chapNum: this.parseChapterNumber(name),
                    time: this.parseDate(item.datePublished)
                }
            })
            .filter((chapter): chapter is BatCaveChapter => chapter !== undefined)
    }

    private parseReaderData($: CheerioAPI): BatCaveReaderData {
        const html = $.root().html() ?? ''
        const match = html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\})\s*;<\/script>/)

        if (!match) {
            return {}
        }

        try {
            return JSON.parse(match[1]) as BatCaveReaderData
        } catch {
            return {}
        }
    }

    private findJsonLdNode($: CheerioAPI, type: string): JsonLdNode | undefined {
        const nodes = this.getJsonLdNodes($)

        return nodes.find((node) => this.hasJsonLdType(node, type))
    }

    private getJsonLdNodes($: CheerioAPI): JsonLdNode[] {
        const nodes: JsonLdNode[] = []

        $('script[type="application/ld+json"]').each((_: number, element: any) => {
            const raw = this.cleanText($(element).text())

            if (!raw) {
                return
            }

            try {
                const parsed = JSON.parse(raw) as JsonLdNode

                if (Array.isArray(parsed['@graph'])) {
                    nodes.push(...parsed['@graph'])
                } else {
                    nodes.push(parsed)
                }
            } catch {
                return
            }
        })

        return nodes
    }

    private hasJsonLdType(node: JsonLdNode, type: string): boolean {
        const value = node['@type']

        if (Array.isArray(value)) {
            return value.includes(type)
        }

        return value === type
    }

    private extractPublisherName($: CheerioAPI, series?: JsonLdNode): string | undefined {
        if (!series?.publisher) {
            return undefined
        }

        if (typeof series.publisher === 'string') {
            return series.publisher
        }

        if (series.publisher.name) {
            return series.publisher.name
        }

        const publisherId = series.publisher['@id']

        if (!publisherId) {
            return undefined
        }

        return this.getJsonLdNodes($).find((node) => node['@id'] === publisherId)?.name
    }

    private extractListValue($: CheerioAPI, label: string): string | undefined {
        let value: string | undefined

        $('.page__list li').each((_: number, element: any) => {
            const text = this.cleanText($(element).text())
            const normalizedLabel = `${label}:`

            if (!text.startsWith(normalizedLabel)) {
                return
            }

            value = this.cleanText(text.replace(normalizedLabel, '')) || undefined
        })

        return value
    }

    private extractComicId(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        const pathname = url.replace(BATCAVE_DOMAIN, '').split('?')[0].replace(/^\//, '')

        return pathname.endsWith('.html') ? pathname : undefined
    }

    private extractReaderIds(url?: string): { comicNumericId: string; chapterId: string } | undefined {
        if (!url) {
            return undefined
        }

        const match = url.match(/\/reader\/(\d+)\/(\d+|first)/)

        if (!match || match[2] === 'first') {
            return undefined
        }

        return {
            comicNumericId: match[1],
            chapterId: match[2]
        }
    }

    private extractNumericId(comicId: string): string | undefined {
        return comicId.match(/^(\d+)-/)?.[1]
    }

    private parseChapterNumber(text: string): number | undefined {
        const omnibusMatch = text.match(/Omnibus\s+Vol\.\s*(\d+(?:\.\d+)?)/i)
        const issueMatch = text.match(/(?:Issue|#)\s*#?(\d+(?:\.\d+)?)/i)
        const match = omnibusMatch || issueMatch

        if (!match) {
            return undefined
        }

        const value = Number.parseFloat(match[1])

        return Number.isFinite(value) ? value : undefined
    }

    private parseYear(value?: string): number | undefined {
        const match = value?.match(/(\d{4})/)
        const year = match ? Number.parseInt(match[1], 10) : undefined

        return year !== undefined && Number.isFinite(year) ? year : undefined
    }

    private parseDate(value?: string): Date | undefined {
        if (!value) {
            return undefined
        }

        const date = new Date(value)

        return Number.isNaN(date.getTime()) ? undefined : date
    }

    private absoluteUrl(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        if (url.startsWith('//')) {
            return `https:${url}`
        }

        if (url.startsWith('/')) {
            return `${BATCAVE_DOMAIN}${url}`
        }

        return url
    }

    private cleanText(value?: string): string {
        return (value ?? '')
            .replace(/\s+/g, ' ')
            .replace(/\u00a0/g, ' ')
            .trim()
    }
}
