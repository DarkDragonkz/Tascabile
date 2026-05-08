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
    genres: string[]
    authors: string[]
    artists: string[]
    publisher?: string
    status?: string
    year?: number
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

interface JsonLdGraphNode {
    '@type'?: string | string[]
    '@id'?: string
    url?: string
    name?: string
    image?: string
    thumbnailUrl?: string
    description?: string
    genre?: string[] | string
    publisher?: JsonLdReference | JsonLdReference[]
    author?: JsonLdReference | JsonLdReference[]
    illustrator?: JsonLdReference | JsonLdReference[]
    artist?: JsonLdReference | JsonLdReference[]
    startDate?: string
    hasPart?: {
        itemListElement?: Array<{
            item?: JsonLdGraphNode
        }>
    }
}

interface JsonLdReference {
    '@id'?: string
    name?: string
}

interface ReaderData {
    chapter_id?: number | string
    news_id?: number | string
    title?: string
    images?: string[]
    chapters?: Array<{
        id: number | string
        title: string
        title_en?: string
    }>
}

export class BatCaveParser {
    parseSearchResults($: CheerioAPI): BatCaveSourceComic[] {
        const results: BatCaveSourceComic[] = []
        const seen = new Set<string>()

        $('.readed.d-flex.short').each((_: number, element: any) => {
            const item = this.parseComicFromSearchCard($, element)

            if (!item || seen.has(item.comicId)) {
                return
            }

            seen.add(item.comicId)
            results.push(item)
        })

        return results
    }

    parseHomeSectionItems($: CheerioAPI, rootSelector: string): BatCaveSourceComic[] {
        const results: BatCaveSourceComic[] = []
        const seen = new Set<string>()

        $(rootSelector).find('a.poster[href$=".html"], a.poster[href*="batcave.biz/"]').each((_: number, element: any) => {
            const item = this.parseComicFromPoster($, element)

            if (!item || seen.has(item.comicId)) {
                return
            }

            seen.add(item.comicId)
            results.push(item)
        })

        return results
    }

    parseHomeSectionItemsByHeading($: CheerioAPI, headings: string[]): BatCaveSourceComic[] {
        const normalizedHeadings = headings.map((heading: string) => this.normalizeTextForMatch(heading))
        const results: BatCaveSourceComic[] = []
        const seen = new Set<string>()

        $('h1, h2, h3, .sect__title, .sect__header').each((_: number, headingElement: any) => {
            const headingText = this.normalizeTextForMatch($(headingElement).text())

            if (!normalizedHeadings.some((heading: string) => headingText.includes(heading))) {
                return
            }

            const section = $(headingElement).closest('section, .sect')
            const containers = [
                section,
                $(headingElement).next(),
                $(headingElement).parent(),
                $(headingElement).parent().next()
            ]

            for (const container of containers) {
                container.find('a.poster[href$=".html"], a.poster[href*="batcave.biz/"]').each((__: number, element: any) => {
                    const item = this.parseComicFromPoster($, element)

                    if (!item || seen.has(item.comicId)) {
                        return
                    }

                    seen.add(item.comicId)
                    results.push(item)
                })

                if (results.length > 0) {
                    return false
                }
            }

            return undefined
        })

        return results
    }

    parseComicDetails($: CheerioAPI, comicId: string): BatCaveComicDetails {
        const graph = this.getJsonLdGraph($)
        const series = graph.find((node: JsonLdGraphNode) => this.hasType(node, 'ComicSeries'))
        const entityById = new Map<string, JsonLdGraphNode>()

        graph.forEach((node: JsonLdGraphNode) => {
            if (node['@id']) {
                entityById.set(node['@id'], node)
            }
        })

        const title = this.cleanText(series?.name)
            || this.cleanText($('.page__header h1').first().text())
            || comicId

        const image = this.absoluteUrl(
            series?.image
                || series?.thumbnailUrl
                || this.extractImageUrl($('.page__poster img').first())
                || $('link[rel="preload"][as="image"]').first().attr('href')
        )

        const description = this.cleanText(series?.description)
            || this.cleanText($('.page__text').first().text())
            || this.cleanText($('meta[property="og:description"]').first().attr('content'))
            || this.cleanText($('meta[name="description"]').first().attr('content'))

        const genres = this.toStringArray(series?.genre)
            .concat(this.extractAnchorTexts($, '.page__tags a'))
            .map((genre: string) => this.toTitleCase(genre))
        const uniqueGenres = this.uniqueTexts(genres)

        return {
            id: comicId,
            title,
            image,
            description,
            genres: uniqueGenres,
            authors: this.resolveReferences(series?.author, entityById),
            artists: this.resolveReferences(series?.illustrator ?? series?.artist, entityById),
            publisher: this.resolveReferences(series?.publisher, entityById)[0]
                || this.extractListValue($, 'Publisher'),
            status: this.extractListValue($, 'Release type'),
            year: this.parseYear(series?.startDate)
                ?? this.parseYear(this.extractListValue($, 'Year'))
        }
    }

    parseChapters($: CheerioAPI, comicId: string): BatCaveChapter[] {
        const graph = this.getJsonLdGraph($)
        const series = graph.find((node: JsonLdGraphNode) => this.hasType(node, 'ComicSeries'))
        const chapters: BatCaveChapter[] = []
        const seen = new Set<string>()

        series?.hasPart?.itemListElement?.forEach((element: { item?: JsonLdGraphNode }) => {
            const item = element.item
            const id = this.extractChapterId(item?.url)

            if (!id || seen.has(id)) {
                return
            }

            const name = this.cleanText(item?.name) || id

            seen.add(id)
            chapters.push({
                id,
                comicId,
                name,
                chapNum: this.parseIssueNumber(name)
            })
        })

        $('a[href*="/reader/"]').each((_: number, element: any) => {
            const href = $(element).attr('href')
            const id = this.extractChapterId(href)

            if (!id || seen.has(id)) {
                return
            }

            const name = this.cleanText($(element).text())
                || this.cleanText($(element).attr('title'))
                || id

            seen.add(id)
            chapters.push({
                id,
                comicId,
                name,
                chapNum: this.parseIssueNumber(name)
            })
        })

        return chapters
    }

    parseChapterDetails($: CheerioAPI, comicId: string, chapterId: string): BatCaveChapterDetails {
        const data = this.parseReaderData($)
        const pages: string[] = []
        const seen = new Set<string>()

        data?.images?.forEach((image: string) => {
            const page = this.absoluteUrl(image)

            if (!page || seen.has(page)) {
                return
            }

            seen.add(page)
            pages.push(page)
        })

        if (pages.length === 0) {
            $('#ssr-shell img, .reader-view img, img.reader__item').each((_: number, element: any) => {
                const page = this.absoluteUrl(this.extractImageUrl($(element)))

                if (!page || seen.has(page)) {
                    return
                }

                if (!this.isReaderImage(page)) {
                    return
                }

                seen.add(page)
                pages.push(page)
            })
        }

        return {
            id: chapterId,
            comicId,
            pages
        }
    }

    parseReaderChapters($: CheerioAPI, comicId: string): BatCaveChapter[] {
        const data = this.parseReaderData($)

        return (data?.chapters ?? [])
            .map((chapter): BatCaveChapter => {
                const title = [chapter.title, chapter.title_en]
                    .map((value: string | undefined) => this.cleanText(value))
                    .filter(Boolean)
                    .join(' / ')

                return {
                    id: String(chapter.id),
                    comicId,
                    name: title || String(chapter.id),
                    chapNum: this.parseIssueNumber(title)
                }
            })
            .filter((chapter: BatCaveChapter) => Boolean(chapter.id && chapter.name))
    }

    parseTags($: CheerioAPI): BatCaveTag[] {
        const tags: BatCaveTag[] = []
        const seen = new Set<string>()

        $('a[href*="/genres/"]').each((_: number, element: any) => {
            const href = $(element).attr('href')
            const match = href?.match(/\/genres\/([^/?#]+)\/?/)
            const rawId = match?.[1]
            const label = this.cleanText($(element).text())

            if (!rawId || !label) {
                return
            }

            const id = decodeURIComponent(rawId)

            if (seen.has(id)) {
                return
            }

            seen.add(id)
            tags.push({
                id,
                label: this.toTitleCase(label)
            })
        })

        return tags
    }

    extractComicId(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        const path = this.urlPath(url)
        const match = path.match(/^\/([^/?#]+\.html)$/)

        if (!match) {
            return undefined
        }

        return match[1].replace(/\.html$/, '')
    }

    extractPostId(comicId: string): string | undefined {
        return comicId.match(/^(\d+)-/)?.[1]
    }

    private parseComicFromSearchCard($: CheerioAPI, element: any): BatCaveSourceComic | undefined {
        const link = $(element).find('.readed__title a[href$=".html"], .readed__img[href$=".html"]').first()
        const href = link.attr('href') || $(element).find('a[href$=".html"]').first().attr('href')
        const comicId = this.extractComicId(href)

        if (!comicId) {
            return undefined
        }

        const title = this.cleanText($(element).find('.readed__title a').first().text())
            || this.cleanText($(element).find('img').first().attr('alt'))

        if (!title) {
            return undefined
        }

        const meta = $(element).find('.readed__meta-item')
            .map((_: number, metaElement: any) => this.cleanText($(metaElement).text()))
            .get()
            .filter(Boolean)
            .join(' • ')
        const lastIssue = this.cleanText($(element).find('.readed__info li').last().text())
            .replace(/^Last issue:\s*/i, '')
        const subtitle = [meta, lastIssue ? `Last: ${lastIssue}` : '']
            .filter(Boolean)
            .join(' • ')

        return {
            comicId,
            title,
            image: this.absoluteUrl(this.extractImageUrl($(element).find('img').first())),
            subtitle: subtitle || undefined
        }
    }

    private parseComicFromPoster($: CheerioAPI, element: any): BatCaveSourceComic | undefined {
        const href = $(element).attr('href')
        const comicId = this.extractComicId(href)

        if (!comicId) {
            return undefined
        }

        const title = this.cleanText($(element).find('.poster__title').first().text())
            || this.cleanText($(element).find('img').first().attr('alt'))

        if (!title) {
            return undefined
        }

        const subtitle = $(element).find('.poster__subtitle li')
            .map((_: number, item: any) => this.cleanText($(item).text()))
            .get()
            .filter(Boolean)
            .join(' • ')

        return {
            comicId,
            title,
            image: this.absoluteUrl(this.extractImageUrl($(element).find('img').first())),
            subtitle: subtitle || undefined
        }
    }

    private getJsonLdGraph($: CheerioAPI): JsonLdGraphNode[] {
        const graph: JsonLdGraphNode[] = []

        $('script[type="application/ld+json"]').each((_: number, element: any) => {
            const rawJson = $(element).contents().text()

            if (!rawJson) {
                return
            }

            try {
                const data = JSON.parse(rawJson)

                if (Array.isArray(data?.['@graph'])) {
                    graph.push(...data['@graph'])
                } else if (data && typeof data === 'object') {
                    graph.push(data)
                }
            } catch {
                // Ignore invalid embedded JSON-LD blocks.
            }
        })

        return graph
    }

    private parseReaderData($: CheerioAPI): ReaderData | undefined {
        let parsedData: ReaderData | undefined

        $('script').each((_: number, element: any) => {
            const script = $(element).contents().text()
            const match = script.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\})\s*;?\s*(?:<\/script>|$)/)

            if (!match) {
                return
            }

            try {
                parsedData = JSON.parse(match[1])
            } catch {
                parsedData = undefined
            }
        })

        return parsedData
    }

    private resolveReferences(value: JsonLdReference | JsonLdReference[] | undefined, entities: Map<string, JsonLdGraphNode>): string[] {
        const references = Array.isArray(value)
            ? value
            : value
                ? [value]
                : []

        return this.uniqueTexts(references.map((reference: JsonLdReference) => {
            if (reference.name) {
                return reference.name
            }

            const id = reference['@id']
            return id ? entities.get(id)?.name ?? '' : ''
        }))
    }

    private hasType(node: JsonLdGraphNode, type: string): boolean {
        const nodeType = node['@type']

        return Array.isArray(nodeType)
            ? nodeType.includes(type)
            : nodeType === type
    }

    private extractListValue($: CheerioAPI, label: string): string | undefined {
        let value: string | undefined

        $('.page__list li').each((_: number, element: any) => {
            const labelText = this.cleanText($(element).find('div').first().text()).replace(/:$/, '')

            if (labelText.toLowerCase() !== label.toLowerCase()) {
                return
            }

            const clone = $(element).clone()
            clone.find('div').remove()
            value = this.cleanText(clone.text())
        })

        return value
    }

    private extractAnchorTexts($: CheerioAPI, selector: string): string[] {
        return $(selector)
            .map((_: number, element: any) => this.cleanText($(element).text()))
            .get()
            .filter(Boolean)
    }

    private extractChapterId(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        const match = this.urlPath(url).match(/\/reader\/\d+\/([^/?#]+)/)

        return match?.[1]
    }

    private urlPath(url: string): string {
        if (url.startsWith('http')) {
            try {
                return new URL(url).pathname
            } catch {
                return url
            }
        }

        return url.startsWith('/') ? url : `/${url}`
    }

    private absoluteUrl(url?: string): string | undefined {
        const cleanedUrl = this.cleanText(url)

        if (!cleanedUrl || cleanedUrl.startsWith('data:')) {
            return undefined
        }

        if (cleanedUrl.startsWith('//')) {
            return `https:${cleanedUrl}`
        }

        if (cleanedUrl.startsWith('/')) {
            return `${BATCAVE_DOMAIN}${cleanedUrl}`
        }

        return cleanedUrl
    }

    private extractImageUrl(image: any): string | undefined {
        if (!image || image.length === 0) {
            return undefined
        }

        return this.cleanText(image.attr('data-src'))
            || this.cleanText(image.attr('data-original'))
            || this.extractFirstSrcFromSrcset(image.attr('data-srcset'))
            || this.cleanText(image.attr('src'))
            || this.extractFirstSrcFromSrcset(image.attr('srcset'))
            || undefined
    }

    private extractFirstSrcFromSrcset(srcset?: string): string | undefined {
        if (!srcset) {
            return undefined
        }

        return this.cleanText(srcset.split(',')[0]?.trim().split(/\s+/)[0]) || undefined
    }

    private isReaderImage(url: string): boolean {
        const normalizedUrl = url.toLowerCase().split('#')[0].split('?')[0]

        return normalizedUrl.includes('img.batcave.biz/img/')
            || /\/img\/\d+\/\d+\/\d+\//.test(normalizedUrl)
    }

    private toStringArray(value?: string[] | string): string[] {
        if (Array.isArray(value)) {
            return value.map((item: string) => this.cleanText(item)).filter(Boolean)
        }

        return this.cleanText(value)
            ? [this.cleanText(value)]
            : []
    }

    private uniqueTexts(values: string[]): string[] {
        const seen = new Set<string>()
        const unique: string[] = []

        values.map((value: string) => this.cleanText(value)).filter(Boolean).forEach((value: string) => {
            const key = value.toLowerCase()

            if (seen.has(key)) {
                return
            }

            seen.add(key)
            unique.push(value)
        })

        return unique
    }

    private parseYear(text?: string): number | undefined {
        const match = this.cleanText(text).match(/\d{4}/)
        const year = match ? Number.parseInt(match[0], 10) : undefined

        return year !== undefined && Number.isFinite(year) ? year : undefined
    }

    private parseIssueNumber(text: string): number | undefined {
        const match = this.cleanText(text).match(/(?:#|Issue\s+#?)(\d+(?:\.\d+)?)/i)
        const number = match ? Number.parseFloat(match[1]) : undefined

        return number !== undefined && Number.isFinite(number) ? number : undefined
    }

    private toTitleCase(value: string): string {
        return this.cleanText(value).replace(/\b\w/g, (character: string) => character.toUpperCase())
    }

    private normalizeTextForMatch(value?: string): string {
        return this.cleanText(value)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
    }

    private cleanText(value?: string): string {
        return (value ?? '')
            .replace(/\s+/g, ' ')
            .replace(/\u00a0/g, ' ')
            .trim()
    }
}
