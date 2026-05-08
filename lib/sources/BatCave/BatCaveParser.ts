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
    dateCreated?: string
    itemListElement?: JsonLdListItem[]
    hasPart?: {
        itemListElement?: JsonLdListItem[]
    }
}

interface BatCaveWindowChapter {
    id?: number
    posi?: number
    pages?: number
    title?: string
    title_en?: string
    date?: string
}

interface BatCaveWindowData {
    news_id?: number
    title?: string
    chapters?: BatCaveWindowChapter[]
    images?: string[]
}

export class BatCaveParser {
    parseHomeItems($: CheerioAPI, selector = 'a.poster.grid-item.has-overlay, a.poster, a.popular'): BatCaveSourceComic[] {
        const results: BatCaveSourceComic[] = []

        $(selector).each((_: number, element: any) => {
            const anchor = $(element).is('a') ? $(element) : $(element).find('a[href$=".html"]').first()
            const comicId = this.extractComicId(anchor.attr('href'))
            const imageElement = anchor.find('img').first()
            const title = this.cleanText(anchor.find('.poster__title, .popular__title').first().text())
                || this.cleanText(imageElement.attr('alt'))
                || this.cleanText(anchor.text())

            if (!comicId || !title) return

            const subtitle = anchor
                .find('.poster__subtitle li')
                .map((__: number, item: any) => this.cleanText($(item).text()))
                .get()
                .filter(Boolean)
                .join(' • ')

            results.push({
                comicId,
                title,
                image: this.extractImageUrl(imageElement),
                subtitle: subtitle || undefined
            })
        })

        return this.dedupeSourceComics(results)
    }

    parseSearchResults($: CheerioAPI): BatCaveSourceComic[] {
        const results: BatCaveSourceComic[] = []

        $('.readed.d-flex.short, .readed.short, div[class*="readed"][class*="short"]').each((_: number, element: any) => {
            const link = $(element).find('.readed__title a[href], h2 a[href], a[href$=".html"]').first()
            const href = link.attr('href') || $(element).find('a[href$=".html"]').first().attr('href')
            const comicId = this.extractComicId(href)
            const imageElement = $(element).find('img').first()
            const title = this.cleanText(link.text()) || this.cleanText(imageElement.attr('alt'))

            if (!comicId || !title) return

            const meta = $(element)
                .find('.readed__meta-item')
                .map((__: number, item: any) => this.cleanText($(item).text()))
                .get()
                .filter(Boolean)

            const lastIssue = this.cleanText($(element).find('.readed__info li').last().text().replace(/^Last issue:\s*/i, ''))

            results.push({
                comicId,
                title,
                image: this.extractImageUrl(imageElement),
                subtitle: lastIssue || meta.join(' • ') || undefined
            })
        })

        return this.dedupeSourceComics(results)
    }

    parseTags($: CheerioAPI): { publishers: BatCaveTag[]; years: BatCaveTag[] } {
        const publishers = new Map<string, BatCaveTag>()
        const years = new Map<string, BatCaveTag>()

        $('a.poster, a.popular, .readed.d-flex.short, .readed.short').each((_: number, element: any) => {
            const metaItems = $(element)
                .find('.poster__subtitle li, .readed__meta-item')
                .map((__: number, item: any) => this.cleanText($(item).text()))
                .get()
                .filter(Boolean)

            const publisher = metaItems.find((item: string) => !/^\d{4}$/.test(item))
            const year = metaItems.find((item: string) => /^\d{4}$/.test(item))

            if (publisher) publishers.set(this.slugify(publisher), { id: this.slugify(publisher), label: publisher })
            if (year) years.set(year, { id: year, label: year })
        })

        return {
            publishers: Array.from(publishers.values()),
            years: Array.from(years.values())
        }
    }

    parseComicDetails($: CheerioAPI, fallbackComicId: string): BatCaveComicDetails {
        const windowData = this.parseWindowData($)
        const series = this.findJsonLdNode($, 'ComicSeries')
        const comicId = this.extractComicId(series?.url) || fallbackComicId
        const title = this.cleanText(windowData.title)
            || this.cleanText(series?.name)
            || this.cleanText($('.page__header h1, article.page h1, h1').first().text())
            || comicId
        const publisher = this.extractPublisherName($, series) || this.extractListValue($, 'Publisher')
        const description = this.cleanText($('.page__text.full-text, .page__text').first().text())
            || this.cleanText(series?.description)
            || this.cleanText($('meta[property="og:description"]').attr('content'))
            || this.cleanText($('meta[name="description"]').attr('content'))
        const image = this.extractImageUrl($('.page__poster img').first())
            || this.absoluteUrl(series?.image)
            || this.absoluteUrl(series?.thumbnailUrl)
            || this.absoluteUrl($('link[rel="preload"][as="image"]').first().attr('href'))
        const year = this.parseYear(this.extractListValue($, 'Year')) || this.parseYear(series?.startDate)
        const chapters = this.parseChaptersFromWindowData(windowData, comicId)

        return {
            id: comicId,
            title,
            image,
            description,
            publisher,
            status: this.extractListValue($, 'Release type'),
            year,
            chapters: chapters.length > 0 ? chapters : this.parseChaptersFromSeries(series, comicId)
        }
    }

    parseChapters($: CheerioAPI, fallbackComicId: string): BatCaveChapter[] {
        const windowData = this.parseWindowData($)
        const series = this.findJsonLdNode($, 'ComicSeries')
        const comicId = this.extractComicId(series?.url) || fallbackComicId
        const dataChapters = this.parseChaptersFromWindowData(windowData, comicId)

        if (dataChapters.length > 0) return dataChapters

        const jsonLdChapters = this.parseChaptersFromSeries(series, comicId)

        if (jsonLdChapters.length > 0) return jsonLdChapters

        const chapters: BatCaveChapter[] = []

        $('a[href*="/reader/"]').each((_: number, element: any) => {
            const parsed = this.extractReaderIds($(element).attr('href'))
            const name = this.cleanText($(element).text()) || this.cleanText($(element).attr('title'))

            if (!parsed || parsed.comicNumericId !== this.extractNumericId(comicId) || !name) return

            chapters.push({
                id: parsed.chapterId,
                comicId,
                name,
                chapNum: this.parseChapterNumber(name)
            })
        })

        return this.dedupeChapters(chapters)
    }

    parseChapterDetails($: CheerioAPI, comicId: string, chapterId: string): BatCaveChapterDetails {
        const windowData = this.parseWindowData($)
        const jsonLdIssue = this.findJsonLdNode($, 'ComicIssue')
        const seen = new Set<string>()
        const pages: string[] = []

        for (const image of windowData.images ?? []) {
            const page = this.absoluteUrl(image)

            if (!page || seen.has(page)) continue

            seen.add(page)
            pages.push(page)
        }

        if (pages.length === 0) {
            $('img').each((_: number, element: any) => {
                const page = this.extractImageUrl($(element))

                if (!page || seen.has(page)) return

                seen.add(page)
                pages.push(page)
            })
        }

        if (pages.length === 0) {
            const image = this.absoluteUrl(jsonLdIssue?.image)
            if (image) pages.push(image)
        }

        return {
            id: chapterId,
            comicId,
            pages
        }
    }

    private parseChaptersFromWindowData(data: BatCaveWindowData, comicId: string): BatCaveChapter[] {
        const chapters = data.chapters ?? []

        return this.dedupeChapters(chapters
            .filter((chapter) => chapter.id !== undefined)
            .map((chapter) => {
                const name = this.cleanText(chapter.title_en) || this.cleanText(chapter.title) || `Chapter ${chapter.posi ?? chapter.id}`

                return {
                    id: String(chapter.id),
                    comicId,
                    name,
                    chapNum: chapter.posi ?? this.parseChapterNumber(name),
                    time: this.parseBatCaveDate(chapter.date)
                }
            }))
    }

    private parseChaptersFromSeries(series: JsonLdNode | undefined, comicId: string): BatCaveChapter[] {
        const elements = series?.hasPart?.itemListElement ?? []

        return this.dedupeChapters(elements
            .map((element) => {
                const item = element.item
                const parsed = this.extractReaderIds(item?.url)
                const name = this.cleanText(item?.name)

                if (!item || !parsed || !name) return undefined

                return {
                    id: parsed.chapterId,
                    comicId,
                    name,
                    chapNum: this.parseChapterNumber(name),
                    time: this.parseDate(item.datePublished)
                }
            })
            .filter((chapter): chapter is BatCaveChapter => chapter !== undefined))
    }

    private parseWindowData($: CheerioAPI): BatCaveWindowData {
        const html = $.root().html() ?? ''
        const match = html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/)

        if (!match) return {}

        try {
            return JSON.parse(match[1]) as BatCaveWindowData
        } catch {
            return {}
        }
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
        const value = node['@type']
        return Array.isArray(value) ? value.includes(type) : value === type
    }

    private extractPublisherName($: CheerioAPI, series?: JsonLdNode): string | undefined {
        if (!series?.publisher) return undefined
        if (typeof series.publisher === 'string') return series.publisher
        if (series.publisher.name) return series.publisher.name

        const publisherId = series.publisher['@id']
        if (!publisherId) return undefined

        return this.getJsonLdNodes($).find((node) => node['@id'] === publisherId)?.name
    }

    private extractListValue($: CheerioAPI, label: string): string | undefined {
        let value: string | undefined

        $('.page__list li').each((_: number, element: any) => {
            const labelText = this.cleanText($(element).find('div').first().text()).replace(/:$/, '')

            if (labelText.toLowerCase() !== label.toLowerCase()) return

            const cloned = $(element).clone()
            cloned.find('div').remove()
            value = this.cleanText(cloned.text()) || undefined
        })

        return value
    }

    private extractComicId(url?: string): string | undefined {
        if (!url) return undefined

        const pathname = url.replace(BATCAVE_DOMAIN, '').split('?')[0].replace(/^\//, '')
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
        const match = text.match(/(?:Issue|#)\s*#?(\d+(?:\.\d+)?)/i) || text.match(/Omnibus\s+Vol\.\s*(\d+(?:\.\d+)?)/i)
        const value = match ? Number.parseFloat(match[1]) : undefined

        return value !== undefined && Number.isFinite(value) ? value : undefined
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
            const absolute = this.absoluteUrl(candidate)
            if (absolute && this.isUsableImageUrl(absolute)) return absolute
        }

        return undefined
    }

    private isUsableImageUrl(url: string): boolean {
        return !url.startsWith('data:image/') && /\.(jpg|jpeg|png|webp)(?:\?|$)/i.test(url)
    }

    private absoluteUrl(url?: string): string | undefined {
        if (!url) return undefined
        if (url.startsWith('//')) return `https:${url}`
        if (url.startsWith('/')) return `${BATCAVE_DOMAIN}${url}`
        return url
    }

    private slugify(value: string): string {
        return value
            .toLowerCase()
            .replace(/&amp;/g, 'and')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
    }

    private dedupeSourceComics(items: BatCaveSourceComic[]): BatCaveSourceComic[] {
        const seen = new Set<string>()
        const results: BatCaveSourceComic[] = []

        for (const item of items) {
            if (seen.has(item.comicId)) continue
            seen.add(item.comicId)
            results.push(item)
        }

        return results
    }

    private dedupeChapters(items: BatCaveChapter[]): BatCaveChapter[] {
        const seen = new Set<string>()
        const results: BatCaveChapter[] = []

        for (const item of items) {
            if (seen.has(item.id)) continue
            seen.add(item.id)
            results.push(item)
        }

        return results
    }

    private cleanText(value?: string): string {
        return (value ?? '')
            .replace(/\s+/g, ' ')
            .replace(/\u00a0/g, ' ')
            .trim()
    }
}
