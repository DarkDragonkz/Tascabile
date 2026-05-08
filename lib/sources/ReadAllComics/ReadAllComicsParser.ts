import type { CheerioAPI } from 'cheerio'
import { READ_ALL_COMICS_DOMAIN } from './constants'

export interface ReadAllComicsSeries {
    mangaId: string
    title: string
    image?: string
    subtitle?: string
    publisher?: string
    genres: string[]
    year?: number
    issueCount?: number
    latestChapterId?: string
    latestChapterName?: string
    updatedAt?: Date
}

export interface ReadAllComicsDetails {
    id: string
    title: string
    image?: string
    description?: string
    publisher?: string
    genres: string[]
    year?: number
    issueCount?: number
}

export interface ReadAllComicsChapter {
    id: string
    mangaId: string
    name: string
    chapNum?: number
    volume?: number
    time?: Date
}

export interface ReadAllComicsChapterDetails {
    id: string
    mangaId: string
    pages: string[]
}

export class ReadAllComicsParser {
    parseSeriesList($: CheerioAPI): ReadAllComicsSeries[] {
        const results: ReadAllComicsSeries[] = []
        const seen = new Set<string>()

        $('#post-area .post').each((_: number, element: any) => {
            const item = this.parsePostGridItem($, element)

            if (!item || seen.has(item.mangaId)) {
                return
            }

            seen.add(item.mangaId)
            results.push(item)
        })

        $('a.cat-title[href*="/category/"]').each((_: number, element: any) => {
            const item = this.parseSeriesItemFromTitleLink($, element)

            if (!item || seen.has(item.mangaId)) {
                return
            }

            seen.add(item.mangaId)
            results.push(item)
        })

        return results
    }

    parseSeriesDetails($: CheerioAPI, mangaId: string): ReadAllComicsDetails {
        const title = this.cleanCategoryTitle(
            this.cleanText($('h1.page-title span').last().text())
                || this.cleanText($('meta[property="og:title"]').attr('content'))
                || this.cleanText($('title').first().text())
                || this.titleFromSlug(mangaId)
        )

        const image = this.absoluteUrl(
            this.cleanText($('meta[property="og:image:secure_url"]').attr('content'))
                || this.cleanText($('meta[property="og:image"]').attr('content'))
                || this.extractImageUrl($('.description-archive img, #post-area .post img, img.book-cover').first())
        )

        const description = this.cleanText($('meta[name="description"]').attr('content'))
            || this.cleanText($('meta[property="og:description"]').attr('content'))

        const issueCount = this.parseInteger(
            this.cleanText($('meta[name="twitter:data1"]').attr('content'))
        )

        return {
            id: mangaId,
            title,
            image: image && !this.isPlaceholderImage(image) ? image : undefined,
            description,
            genres: [],
            issueCount
        }
    }

    parseChapters($: CheerioAPI, mangaId: string): ReadAllComicsChapter[] {
        const chapters: ReadAllComicsChapter[] = []
        const seen = new Set<string>()

        $('a[href]').each((_: number, element: any) => {
            const href = $(element).attr('href')
            const id = this.extractPostId(href)
            const name = this.cleanText($(element).text())

            if (!id || !name || seen.has(id) || this.isIgnoredChapterLink(href)) {
                return
            }

            seen.add(id)
            chapters.push({
                id,
                mangaId,
                name,
                chapNum: this.parseChapterNumber(name, id),
                volume: this.parseVolume(name, id)
            })
        })

        return chapters
    }

    parseChapterDetails($: CheerioAPI, mangaId: string, chapterId: string): ReadAllComicsChapterDetails {
        const html = $.html()
        const pages: string[] = []
        const seen = new Set<string>()

        const imageTags = $('img').toArray()
            .map((element: any) => this.extractImageUrl($(element)))
            .filter((url): url is string => Boolean(url))

        const rawUrls = html.match(/https?:\\?\/\\?\/[^"'<>\s)]+/gi) ?? []
        const normalizedRawUrls = rawUrls.map((url: string) => this.decodeHtmlEntities(url.replace(/\\\//g, '/')))

        for (const rawUrl of [...imageTags, ...normalizedRawUrls]) {
            const page = this.absoluteUrl(rawUrl)

            if (!page || seen.has(page) || !this.isPageImage(page)) {
                continue
            }

            seen.add(page)
            pages.push(page)
        }

        return {
            id: chapterId,
            mangaId,
            pages
        }
    }

    parseChapterTitle($: CheerioAPI, fallbackId: string): string {
        return this.cleanText($('h3 strong').first().text())
            || this.cleanText($('h1.entry-title, h1.post-title, h1').first().text())
            || this.titleFromSlug(fallbackId)
    }

    extractCategoryId(url?: string): string | undefined {
        const path = this.pathFromUrl(url)
        const match = path.match(/^\/category\/([^/]+)\/?$/)

        return match?.[1]
    }

    extractPostId(url?: string): string | undefined {
        const path = this.pathFromUrl(url)

        if (!path) {
            return undefined
        }

        if (path.startsWith('/category/') || path.startsWith('/page/') || path.startsWith('/tag/') || path.startsWith('/author/')) {
            return undefined
        }

        const parts = path.split('/').filter(Boolean)
        const slug = parts[0]

        if (!slug || slug.startsWith('wp-') || slug === 'xmlrpc.php') {
            return undefined
        }

        return slug
    }

    private parseSeriesItemFromTitleLink($: CheerioAPI, element: any): ReadAllComicsSeries | undefined {
        const titleLink = $(element)
        const href = titleLink.attr('href')
        const mangaId = this.extractCategoryId(href)

        if (!mangaId) {
            return undefined
        }

        const container = titleLink.closest('li')
        const title = this.cleanText(titleLink.text())
            || this.cleanText(container.find('img.book-cover').first().attr('alt'))
            || this.titleFromSlug(mangaId)

        if (!title) {
            return undefined
        }

        const publisher = this.cleanLabelValue(container.find('.cat-publisher').first().text(), 'Publisher')
        const genres = this.cleanLabelValue(container.find('.cat-genres').first().text(), 'Genres')
            .split(',')
            .map((genre: string) => this.cleanText(genre))
            .filter(Boolean)
        const year = this.parseInteger(
            this.cleanText(container.find('.cat-year, .cat-vol').first().text())
        )
        const issueCount = this.parseInteger(
            this.cleanText(container.find('.issue-count').first().text())
        )
        const latestChapter = container.find('a.latest-chapter').first()
        const latestChapterId = this.extractPostId(latestChapter.attr('href'))
        const latestChapterName = this.cleanText(latestChapter.text())
        const updatedAt = this.parseUpdatedDate(container.find('.latest-date').first().text())

        const subtitleParts = [
            publisher,
            year ? String(year) : '',
            issueCount ? `${issueCount} issues` : '',
            latestChapterName ? `Latest: ${latestChapterName}` : ''
        ].filter(Boolean)

        return {
            mangaId,
            title: this.decodeHtmlEntities(title),
            image: this.absoluteUrl(this.extractImageUrl(container.find('img.book-cover').first())),
            subtitle: subtitleParts.join(' • ') || undefined,
            publisher,
            genres,
            year,
            issueCount,
            latestChapterId,
            latestChapterName,
            updatedAt
        }
    }

    private parsePostGridItem($: CheerioAPI, element: any): ReadAllComicsSeries | undefined {
        const link = $(element).find('.pinbin-copy a, h2 a, h1 a, a[rel="bookmark"], a').first()
        const href = link.attr('href')
        const title = this.decodeHtmlEntities(
            this.cleanText(link.text())
                || this.cleanText(link.attr('title'))
                || this.cleanText($(element).find('img').first().attr('alt'))
        )

        if (!title) {
            return undefined
        }

        let mangaId = this.extractCategoryId(href)

        if (!mangaId) {
            const classAttribute = $(element).attr('class') ?? ''
            const categoryMatch = classAttribute.match(/(?:^|\s)category-([^\s]+)/)
            mangaId = categoryMatch?.[1]
        }

        if (!mangaId) {
            mangaId = this.extractPostId(href)
        }

        if (!mangaId) {
            return undefined
        }

        const subtitle = this.cleanText($(element).find('.pinbin-copy span, time, .entry-date').first().text())

        return {
            mangaId,
            title,
            image: this.absoluteUrl(this.extractImageUrl($(element).find('img').first())),
            subtitle: subtitle || undefined,
            genres: []
        }
    }

    private extractImageUrl(image: any): string | undefined {
        if (!image || image.length === 0) {
            return undefined
        }

        return this.cleanText(image.attr('data-src'))
            || this.cleanText(image.attr('data-lazy-src'))
            || this.cleanText(image.attr('data-original'))
            || this.extractFirstSrcFromSrcset(image.attr('data-srcset'))
            || this.extractFirstSrcFromSrcset(image.attr('srcset'))
            || this.cleanText(image.attr('src'))
            || undefined
    }

    private extractFirstSrcFromSrcset(srcset?: string): string | undefined {
        if (!srcset) {
            return undefined
        }

        return this.cleanText(srcset.split(',')[0]?.trim().split(/\s+/)[0]) || undefined
    }

    private isPageImage(url: string): boolean {
        const normalized = url.toLowerCase().split('?')[0]

        if (/logo|icon|avatar|readallcomics-1|cropped-logo/.test(normalized)) {
            return false
        }

        return normalized.includes('blogspot.')
            || normalized.includes('blogger.googleusercontent.com')
            || normalized.includes('googleusercontent.com')
            || normalized.includes('s3.amazonaws.com/comicgeeks')
    }

    private isPlaceholderImage(url: string): boolean {
        return url.toLowerCase().includes('readallcomics-1.jpg')
    }

    private isIgnoredChapterLink(url?: string): boolean {
        const path = this.pathFromUrl(url)

        if (!path) {
            return true
        }

        return path.startsWith('/category/')
            || path.startsWith('/page/')
            || path.startsWith('/tag/')
            || path.startsWith('/author/')
            || path.includes('/wp-')
            || path.includes('/report-error')
            || path.includes('/request-comics')
            || path.includes('/vip-ad-free')
            || path.includes('/new-comments')
    }

    private parseChapterNumber(name: string, id: string): number | undefined {
        const text = `${name} ${id}`
        const patterns = [
            /(?:#|\bv\d+\s+)(\d{1,4})(?!\d)/i,
            /(?:^|[-\s])(\d{1,4})(?:[-\s](?:19|20)\d{2}|$)/i
        ]

        for (const pattern of patterns) {
            const match = text.match(pattern)
            const number = match ? Number.parseFloat(match[1]) : undefined

            if (number !== undefined && Number.isFinite(number)) {
                return number
            }
        }

        return undefined
    }

    private parseVolume(name: string, id: string): number | undefined {
        const match = `${name} ${id}`.match(/\bv(\d+)\b/i)
        const volume = match ? Number.parseInt(match[1], 10) : undefined

        return volume !== undefined && Number.isFinite(volume) ? volume : undefined
    }

    private parseUpdatedDate(value?: string): Date | undefined {
        const cleanedValue = this.cleanText(value).replace(/^Updated:\s*/i, '')

        if (!cleanedValue) {
            return undefined
        }

        const date = new Date(cleanedValue)

        return Number.isNaN(date.getTime()) ? undefined : date
    }

    private parseInteger(value?: string): number | undefined {
        const match = this.cleanText(value).match(/\d+/)
        const integer = match ? Number.parseInt(match[0], 10) : undefined

        return integer !== undefined && Number.isFinite(integer) ? integer : undefined
    }

    private cleanCategoryTitle(value: string): string {
        return this.decodeHtmlEntities(value)
            .replace(/^Read\s+/i, '')
            .replace(/\s+Comic Book Online Free$/i, '')
            .replace(/\s+-\s+ReadAllComics$/i, '')
            .replace(/\s+-\s+Read All Comics Online$/i, '')
            .trim()
    }

    private titleFromSlug(slug?: string): string {
        return this.decodeHtmlEntities(
            this.cleanText(slug?.replace(/-/g, ' ')).replace(/\b\w/g, (character: string) => character.toUpperCase())
        )
    }

    private cleanLabelValue(value: string, label: string): string {
        return this.decodeHtmlEntities(
            this.cleanText(value).replace(new RegExp(`^${label}:\\s*`, 'i'), '')
        )
    }

    private pathFromUrl(url?: string): string {
        if (!url) {
            return ''
        }

        try {
            return new URL(this.decodeHtmlEntities(url), READ_ALL_COMICS_DOMAIN).pathname
        } catch {
            return ''
        }
    }

    private absoluteUrl(url?: string): string | undefined {
        const cleanedUrl = this.decodeHtmlEntities(this.cleanText(url))

        if (!cleanedUrl || cleanedUrl.startsWith('data:')) {
            return undefined
        }

        if (cleanedUrl.startsWith('//')) {
            return `https:${cleanedUrl}`
        }

        if (cleanedUrl.startsWith('/')) {
            return `${READ_ALL_COMICS_DOMAIN}${cleanedUrl}`
        }

        return cleanedUrl
    }

    private decodeHtmlEntities(value?: string): string {
        return this.cleanText(value)
            .replace(/&amp;/g, '&')
            .replace(/&#038;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
    }

    private cleanText(value?: string): string {
        return (value ?? '')
            .replace(/\s+/g, ' ')
            .replace(/\u00a0/g, ' ')
            .trim()
    }
}
