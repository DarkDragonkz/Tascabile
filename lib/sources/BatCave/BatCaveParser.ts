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

export interface BatCaveTag {
    id: string
    label: string
}

interface JsonLdListItem {
    position?: number
    url?: string
    name?: string
    item?: JsonLdNode
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
    itemListElement?: JsonLdListItem[]
    hasPart?: {
        itemListElement?: JsonLdListItem[]
    }
    pageEnd?: number
}

interface BatCaveWindowChapter {
    id?: number | string
    posi?: number
    pages?: number
    title?: string
    title_en?: string
    date?: string
}

interface BatCaveWindowData {
    news_id?: number | string
    title?: string
    chapters?: BatCaveWindowChapter[]
    images?: string[]
}

export class BatCaveParser {
    parseHomeItems($: CheerioAPI, selector = 'a.poster.grid-item.has-overlay, a.poster, a.popular'): BatCaveSourceComic[] {
        const items: BatCaveSourceComic[] = []

        $(selector).each((_: number, element: any) => {
            const anchor = $(element).is('a') ? $(element) : $(element).find('a[href$=".html"]').first()
            const comicId = this.extractComicId(anchor.attr('href'))
            const imageElement = anchor.find('img').first()
            const title = this.cleanText(anchor.find('.poster__title, .popular__title').first().text())
                || this.cleanText(imageElement.attr('alt'))

            if (!comicId || !title) return

            const subtitle = anchor
                .find('.poster__subtitle li')
                .map((__: number, item: any) => this.cleanText($(item).text()))
                .get()
                .filter(Boolean)
                .join(' • ')

            items.push({
                comicId,
                title,
                image: this.extractImageUrl(imageElement),
                subtitle: subtitle || undefined
            })
        })

        return this.dedupeSourceComics(items)
    }

    parseSearchResults($: CheerioAPI): BatCaveSourceComic[] {
        const items: BatCaveSourceComic[] = []

        $('.readed.d-flex.short, .readed.short, div[class*="readed"][class*="short"]').each((_: number, element: any) => {
            const card = $(element)
            const titleLink = card.find('.readed__title a[href]').first()
            const fallbackLink = card.find('a[href$=".html"]').first()
            const link = titleLink.length > 0 ? titleLink : fallbackLink
            const imageElement = card.find('.readed__img img, img').first()
            const comicId = this.extractComicId(link.attr('href'))
            const title = this.cleanText(link.text()) || this.cleanText(imageElement.attr('alt'))

            if (!comicId || !title) return

            const lastIssue = this.cleanText(card.find('.readed__info li').last().text().replace(/^Last issue:\s*/i, ''))
            const meta = card
                .find('.readed__meta-item')
                .map((__: number, item: any) => this.cleanText($(item).text()))
                .get()
                .filter(Boolean)
                .join(' • ')

            items.push({
                comicId,
                title,
                image: this.extractImageUrl(imageElement),
                subtitle: lastIssue || meta || undefined
            })
        })

        return this.dedupeSourceComics(items)
    }

    parseTags($: CheerioAPI): { publishers: BatCaveTag[]; years: BatCaveTag[] } {
        const publishers = new Map<string, BatCaveTag>()
        const years = new Map<string, BatCaveTag>()

        const addTag = (map: Map<string, BatCaveTag>, label: string): void => {
            const cleanLabel = this.cleanText(label)
            const id = this.slugify(cleanLabel)

            if (!cleanLabel || !id) return

            map.set(id, { id, label: cleanLabel })
        }

        $('a.poster, a.popular, .readed.d-flex.short, .readed.short').each((_: number, element: any) => {
            const values = $(element)
                .find('.poster__subtitle li, .readed__meta-item')
                .map((__: number, item: any) => this.cleanText($(item).text()))
                .get()
                .filter(Boolean)

            for (const value of values) {
                if (/^\d{4}$/.test(value)) years.set(value, { id: value, label: value })
                else addTag(publishers, value)
            }
        })

        return {
            publishers: Array.from(publishers.values()),
            years: Array.from(years.values())
        }
    }

    parseComicDetails($: CheerioAPI, fallbackComicId: string): BatCaveComicDetails {
        const data = this.parseWindowData($)
        const series = this.findJsonLdNode($, 'ComicSeries')
        const comicId = this.extractComicId(series?.url) || this.extractComicId($('link[rel="canonical"]').attr('href')) || fallbackComicId
        const title = this.cleanText(data.title)
            || this.cleanText($('.page__header h1').first().text())
            || this.cleanText($('article.page h1').first().text())
            || this.cleanText(series?.name)
            || comicId
        const description = this.cleanText($('.page__text.full-text').first().text())
            || this.cleanText($('.page__text').first().text())
            || this.cleanText(series?.description)
            || this.cleanText($('meta[property="og:description"]').attr('content'))
            || this.cleanText($('meta[name="description"]').attr('content'))
        const image = this.extractImageUrl($('.page__poster img').first())
            || this.absoluteUrl(series?.image)
            || this.absoluteUrl(series?.thumbnailUrl)
            || this.absoluteUrl($('link[rel="preload"][as="image"]').first().attr('href'))
        const publisher = this.extractListValue($, 'Publisher') || this.extractPublisherName($, series)
        const status = this.extractListValue($, 'Release type')
        const year = this.parseYear(this.extractListValue($, 'Year')) || this.parseYear(series?.startDate)
        const chapters = this.parseChaptersFromWindowData(data, comicId)

        return {
            id: comicId,
            title,
            image,
            description,
            publisher,
            status,
            year,
            chapters: chapters.length > 0 ? chapters : this.parseChaptersFromJsonLd(series, comicId)
        }
    }

    parseChapters($: CheerioAPI, fallbackComicId: string): BatCaveChapter[] {
        const data = this.parseWindowData($)
        const series = this.findJsonLdNode($, 'ComicSeries')
        const comicId = this.extractComicId(series?.url) || this.extractComicId($('link[rel="canonical"]').attr('href')) || fallbackComicId
        const dataChapters = this.parseChaptersFromWindowData(data, comicId)

        if (dataChapters.length > 0) return dataChapters

        const jsonLdChapters = this.parseChaptersFromJsonLd(series, comicId)

        if (jsonLdChapters.length > 0) return jsonLdChapters

        return this.parseReaderLinks($, comicId)
    }

    parseChapterDetails($: CheerioAPI, comicId: string, chapterId: string): BatCaveChapterDetails {
        const data = this.parseWindowData($)
        const pages = this.extractPagesFromWindowData(data)

        return {
            id: chapterId,
            comicId,
            pages: pages.length > 0 ? pages : this.extractPagesFromReaderDom($)
        }
    }

    private parseReaderLinks($: CheerioAPI, comicId: string): BatCaveChapter[] {
        const chapters: BatCaveChapter[] = []
        const numericComicId = this.extractNumericId(comicId)

        $('a[href*="/reader/"]').each((_: number, element: any) => {
            const link = $(element)
            const parsed = this.extractReaderIds(link.attr('href'))
            const name = this.cleanText(link.text()) || this.cleanText(link.attr('title'))

            if (!parsed || parsed.comicNumericId !== numericComicId || !name) return

            const chapter = this.createChapter(parsed.chapterId, comicId, name, this.parseChapterNumber(name), undefined)
            chapters.push(chapter)
        })

        return this.dedupeChapters(chapters)
    }

    private parseChaptersFromWindowData(data: BatCaveWindowData, comicId: string): BatCaveChapter[] {
        const chapters: BatCaveChapter[] = []

        for (const item of data.chapters ?? []) {
            if (item.id === undefined || item.id === null) continue

            const id = String(item.id)
            const name = this.cleanText(item.title_en) || this.cleanText(item.title) || `Chapter ${item.posi ?? id}`
            const number = item.posi ?? this.parseChapterNumber(name)
            const time = this.parseBatCaveDate(item.date)

            chapters.push(this.createChapter(id, comicId, name, number, time))
        }

        return this.dedupeChapters(chapters)
    }

    private parseChaptersFromJsonLd(series: JsonLdNode | undefined, comicId: string): BatCaveChapter[] {
        const chapters: BatCaveChapter[] = []

        for (const element of series?.hasPart?.itemListElement ?? []) {
            const item = element.item
            const parsed = this.extractReaderIds(item?.url)
            const name = this.cleanText(item?.name)

            if (!item || !parsed || !name) continue

            chapters.push(this.createChapter(parsed.chapterId, comicId, name, this.parseChapterNumber(name), this.parseDate(item.datePublished)))
        }

        return this.dedupeChapters(chapters)
    }

    private createChapter(id: string, comicId: string, name: string, number?: number, time?: Date): BatCaveChapter {
        const chapter: BatCaveChapter = { id, comicId, name }

        if (number !== undefined) chapter.chapNum = number
        if (time !== undefined) chapter.time = time

        return chapter
    }

    private extractPagesFromWindowData(data: BatCaveWindowData): string[] {
        const pages: string[] = []
        const seen = new Set<string>()

        for (const image of data.images ?? []) {
            const page = this.absoluteUrl(image)

            if (!page || !this.isUsableImageUrl(page) || seen.has(page)) continue

            seen.add(page)
            pages.push(page)
        }

        return pages
    }

    private extractPagesFromReaderDom($: CheerioAPI): string[] {
        const pages: string[] = []
        const seen = new Set<string>()

        $('#ssr-shell img, .reader-view img, img.reader__item').each((_: number, element: any) => {
            const page = this.extractImageUrl($(element))

            if (!page || seen.has(page)) return

            seen.add(page)
            pages.push(page)
        })

        const issue = this.findJsonLdNode($, 'ComicIssue')
        const jsonLdImage = this.absoluteUrl(issue?.image)

        if (pages.length === 0 && jsonLdImage && this.isUsableImageUrl(jsonLdImage)) {
            pages.push(jsonLdImage)
        }

        return pages
    }

    private parseWindowData($: CheerioAPI): BatCaveWindowData {
        const html = $.root().html() ?? ''
        const marker = 'window.__DATA__'
        const markerIndex = html.indexOf(marker)

        if (markerIndex < 0) return {}

        const equalsIndex = html.indexOf('=', markerIndex)
        const openBraceIndex = html.indexOf('{', equalsIndex)

        if (equalsIndex < 0 || openBraceIndex < 0) return {}

        let depth = 0
        let inString = false
        let escaped = false

        for (let i = openBraceIndex; i < html.length; i++) {
            const char = html[i]

            if (inString) {
                if (escaped) {
                    escaped = false
                    continue
                }

                if (char === '\\') {
                    escaped = true
                    continue
                }

                if (char === '"') {
                    inString = false
                }

                continue
            }

            if (char === '"') {
                inString = true
                continue
            }

            if (char === '{') depth++
            if (char === '}') depth--

            if (depth === 0) {
                const rawJson = html.slice(openBraceIndex, i + 1)

                try {
                    return JSON.parse(rawJson) as BatCaveWindowData
                } catch {
                    return {}
                }
            }
        }

        return {}
    }

    private findJsonLdNode($: CheerioAPI, type: string): JsonLdNode | undefined {
        return this.getJsonLdNodes($).find((node) => this.hasJsonLdType(node, type))
    }

    private getJsonLdNodes($: CheerioAPI): JsonLdNode[] {
        const nodes: JsonLdNode[] = []

        $('script[type="application/ld+json"]').each((_: number, element: any) => {
            const raw = $(element).text().trim()

            if (!raw) return

            try {
                const parsed = JSON.parse(raw) as JsonLdNode

                if (Array.isArray(parsed['@graph'])) nodes.push(...parsed['@graph'])
                else nodes.push(parsed)
            } catch {
                return
            }
        })

        return nodes
    }

    private hasJsonLdType(node: JsonLdNode, type: string): boolean {
        const nodeType = node['@type']

        return Array.isArray(nodeType) ? nodeType.includes(type) : nodeType === type
    }

    private extractPublisherName($: CheerioAPI, series?: JsonLdNode): string | undefined {
        if (!series?.publisher) return undefined

        if (typeof series.publisher === 'string') return this.cleanText(series.publisher) || undefined
        if (series.publisher.name) return this.cleanText(series.publisher.name) || undefined

        const publisherId = series.publisher['@id']

        if (!publisherId) return undefined

        return this.cleanText(this.getJsonLdNodes($).find((node) => node['@id'] === publisherId)?.name) || undefined
    }

    private extractListValue($: CheerioAPI, label: string): string | undefined {
        let result: string | undefined

        $('.page__list li').each((_: number, element: any) => {
            const item = $(element)
            const itemLabel = this.cleanText(item.find('div').first().text()).replace(/:$/, '')

            if (itemLabel.toLowerCase() !== label.toLowerCase()) return

            const clone = item.clone()
            clone.find('div').remove()
            result = this.cleanText(clone.text()) || undefined
        })

        return result
    }

    private extractComicId(url?: string): string | undefined {
        if (!url) return undefined

        const pathname = url
            .replace(BATCAVE_DOMAIN, '')
            .split('#')[0]
            .split('?')[0]
            .replace(/^\//, '')

        return pathname.endsWith('.html') ? pathname : undefined
    }

    private extractReaderIds(url?: string): { comicNumericId: string; chapterId: string } | undefined {
        if (!url) return undefined

        const match = url.match(/\/reader\/(\d+)\/(\d+|first)/)

        if (!match || match[2] === 'first') return undefined

        return {
            comicNumericId: match[1],
            chapterId: match[2]
        }
    }

    private extractNumericId(comicId: string): string | undefined {
        return comicId.match(/^(\d+)-/)?.[1]
    }

    private parseChapterNumber(text: string): number | undefined {
        const issueMatch = text.match(/(?:#|Issue\s*#?)(\d+(?:\.\d+)?)/i)
        const omnibusMatch = text.match(/Omnibus\s+Vol\.\s*(\d+(?:\.\d+)?)/i)
        const value = issueMatch?.[1] ?? omnibusMatch?.[1]

        if (!value) return undefined

        const number = Number.parseFloat(value)

        return Number.isFinite(number) ? number : undefined
    }

    private parseYear(value?: string): number | undefined {
        const match = value?.match(/(\d{4})/)
        const year = match ? Number.parseInt(match[1], 10) : undefined

        return year !== undefined && Number.isFinite(year) ? year : undefined
    }

    private parseDate(value?: string): Date | undefined {
        if (!value) return undefined

        const date = new Date(value)

        return Number.isNaN(date.getTime()) ? undefined : date
    }

    private parseBatCaveDate(value?: string): Date | undefined {
        const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)

        if (!match) return this.parseDate(value)

        const date = new Date(Number.parseInt(match[3], 10), Number.parseInt(match[2], 10) - 1, Number.parseInt(match[1], 10))

        return Number.isNaN(date.getTime()) ? undefined : date
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

            if (url && this.isUsableImageUrl(url)) return url
        }

        return undefined
    }

    private absoluteUrl(url?: string): string | undefined {
        if (!url) return undefined

        if (url.startsWith('//')) return `https:${url}`
        if (url.startsWith('/')) return `${BATCAVE_DOMAIN}${url}`

        return url
    }

    private isUsableImageUrl(url: string): boolean {
        return !url.startsWith('data:image/') && /\.(jpg|jpeg|png|webp)(?:\?|$)/i.test(url)
    }

    private dedupeSourceComics(items: BatCaveSourceComic[]): BatCaveSourceComic[] {
        const seen = new Set<string>()
        const deduped: BatCaveSourceComic[] = []

        for (const item of items) {
            if (seen.has(item.comicId)) continue

            seen.add(item.comicId)
            deduped.push(item)
        }

        return deduped
    }

    private dedupeChapters(items: BatCaveChapter[]): BatCaveChapter[] {
        const seen = new Set<string>()
        const deduped: BatCaveChapter[] = []

        for (const item of items) {
            if (seen.has(item.id)) continue

            seen.add(item.id)
            deduped.push(item)
        }

        return deduped
    }

    private slugify(value: string): string {
        return value
            .toLowerCase()
            .replace(/&amp;/g, 'and')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
    }

    private cleanText(value?: string): string {
        return (value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    }
}
