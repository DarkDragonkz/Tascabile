import type { CheerioAPI } from 'cheerio'
import { MANGA_WORLD_DOMAIN } from './constants'

export interface MangaWorldSourceManga {
    mangaId: string
    title: string
    image?: string
    subtitle?: string
}

export interface MangaWorldMangaDetails {
    id: string
    title: string
    image?: string
    description?: string
    altTitles: string[]
    genres: string[]
    authors: string[]
    artists: string[]
    status?: string
    type?: string
    year?: number
}

export interface MangaWorldChapter {
    id: string
    mangaId: string
    name: string
    chapNum?: number
    volume?: number
    volumeName?: string
    time?: Date
}

export interface MangaWorldChapterDetails {
    id: string
    mangaId: string
    pages: string[]
}

export interface MangaWorldTag {
    id: string
    label: string
}

export class MangaWorldParser {
    parseSearchResults($: CheerioAPI): MangaWorldSourceManga[] {
        const results: MangaWorldSourceManga[] = []
        const seen = new Set<string>()

        $('.comics-grid .entry, .entry.vertical').each((_: number, element: any) => {
            const item = this.parseSourceMangaFromEntry($, element)

            if (!item || seen.has(item.mangaId)) {
                return
            }

            seen.add(item.mangaId)
            results.push(item)
        })

        return results
    }

    parseHomeSectionItems($: CheerioAPI, selector: string): MangaWorldSourceManga[] {
        const results: MangaWorldSourceManga[] = []
        const seen = new Set<string>()

        $(selector).each((_: number, element: any) => {
            const item = this.parseSourceMangaFromEntry($, element)

            if (!item || seen.has(item.mangaId)) {
                return
            }

            seen.add(item.mangaId)
            results.push(item)
        })

        return results
    }

    parseHomeSectionItemsByHeading($: CheerioAPI, headings: string[]): MangaWorldSourceManga[] {
        const normalizedHeadings = headings.map((heading: string) => this.normalizeTextForMatch(heading))
        const results: MangaWorldSourceManga[] = []
        const seen = new Set<string>()

        $('h1, h2, h3, h4, .s-title').each((_: number, headingElement: any) => {
            const headingText = this.normalizeTextForMatch($(headingElement).text())

            if (!normalizedHeadings.some((heading: string) => headingText.includes(heading))) {
                return
            }

            const titleContainer = $(headingElement).closest('.s-title')
            const root = titleContainer.length > 0
                ? titleContainer
                : $(headingElement)

            const candidateContainers = [
                root.next(),
                root.nextAll('.comics-grid, .comics-flex, .row, .swiper, .carousel, section').first(),
                root.parent(),
                root.parent().next(),
                root.closest('section'),
                root.closest('.container'),
                root.closest('.col-12, .col-sm-12, .col-md-8, .col-xl-9'),
                root.parent().find('.comics-grid, .comics-flex, .entry, .entry.vertical').first().parent(),
                $(headingElement).parent().next(),
                $(headingElement).parent()
            ]

            for (const container of candidateContainers) {
                this.collectSourceMangaFromContainer($, container, results, seen)

                if (results.length > 0) {
                    return false
                }
            }

            return undefined
        })

        return results
    }

    parseMangaDetails($: CheerioAPI, mangaId: string): MangaWorldMangaDetails {
        const title = this.cleanText($('.single-comic .name.bigger').first().text())
            || this.cleanText($('h1.name.bigger').first().text())
            || mangaId

        const image = this.absoluteUrl(
            $('.single-comic .comic-info .thumb img').first().attr('src')
                || $('.comic-info img.rounded').first().attr('src')
                || $('meta[property="og:image"]').first().attr('content')
        )

        const description = this.cleanText($('#noidungm').first().text())
            || this.cleanText($('meta[name="description"]').first().attr('content'))

        const altTitlesText = this.extractMetaValue($, 'Titoli alternativi')
        const altTitles = altTitlesText.length > 0
            ? altTitlesText.split(',').map((titleValue: string) => this.cleanText(titleValue)).filter(Boolean)
            : []

        const genres = this.extractAnchorTexts($, '.meta-data a[href*="genre="]')
        const authors = this.extractAnchorTexts($, '.meta-data a[href*="author="]')
        const artists = this.extractAnchorTexts($, '.meta-data a[href*="artist="]')
        const status = this.extractAnchorTexts($, '.meta-data a[href*="status="]')[0]
        const type = this.extractAnchorTexts($, '.meta-data a[href*="type="]')[0]

        const yearText = this.extractAnchorTexts($, '.meta-data a[href*="year="]')[0]
        const parsedYear = yearText ? Number.parseInt(yearText, 10) : undefined

        return {
            id: mangaId,
            title,
            image,
            description,
            altTitles,
            genres,
            authors,
            artists,
            status,
            type,
            year: parsedYear !== undefined && Number.isFinite(parsedYear) ? parsedYear : undefined
        }
    }

    parseChapters($: CheerioAPI, mangaId: string): MangaWorldChapter[] {
        const chapters: MangaWorldChapter[] = []

        $('.volume-element').each((_: number, volumeElement: any) => {
            const volumeName = this.cleanText($(volumeElement).find('.volume-name').first().text())
            const volume = this.parseNumber(volumeName)

            $(volumeElement).find('.chapter').each((__: number, chapterElement: any) => {
                const link = $(chapterElement).find('a.chap, a[href*="/read/"]').first()
                const href = link.attr('href')
                const id = this.extractChapterId(href)

                if (!id) {
                    return
                }

                const titleAttribute = this.cleanText(link.attr('title'))
                const linkText = this.cleanText(link.clone().children().remove().end().text())

                const rawName = linkText
                    || titleAttribute
                    || id

                const name = this.normalizeChapterName(rawName)
                const chapterNumber = this.parseChapterNumber(name)

                const dateText = this.cleanText(
                    $(chapterElement).find('.date, i').last().text()
                )

                chapters.push({
                    id,
                    mangaId,
                    name,
                    chapNum: chapterNumber,
                    volume,
                    volumeName,
                    time: this.parseItalianDate(dateText)
                })
            })
        })

        return chapters
    }

    parseChapterDetails($: CheerioAPI, mangaId: string, chapterId: string): MangaWorldChapterDetails {
        const pages: string[] = []
        const seen = new Set<string>()

        $('#page img.page-image, #page img.img-fluid, #page img, img.page-image, img.img-fluid').each((_: number, element: any) => {
            const src = this.absoluteUrl(
                $(element).attr('src')
                    || $(element).attr('data-src')
                    || this.extractFirstSrcFromSrcset($(element).attr('srcset'))
                    || this.extractFirstSrcFromSrcset($(element).attr('data-srcset'))
            )

            if (!src || seen.has(src)) {
                return
            }

            if (!this.isChapterPageImage(src)) {
                return
            }

            seen.add(src)
            pages.push(src)
        })

        return {
            id: chapterId,
            mangaId,
            pages
        }
    }

    parseTags($: CheerioAPI): MangaWorldTag[] {
        const tags: MangaWorldTag[] = []
        const seen = new Set<string>()

        $('.filters .genres option[data-name], #genresDropdown + .dropdown-menu a[href*="genre="], #mobileGenres a[href*="genre="]').each((_: number, element: any) => {
            const id = this.cleanText($(element).attr('data-name'))
                || this.extractQueryParam($(element).attr('href'), 'genre')

            const label = this.cleanText($(element).text())

            if (!id || !label || seen.has(id)) {
                return
            }

            seen.add(id)
            tags.push({ id, label })
        })

        return tags
    }

    private collectSourceMangaFromContainer(
        $: CheerioAPI,
        container: any,
        results: MangaWorldSourceManga[],
        seen: Set<string>
    ): void {
        container.find('.entry, .entry.vertical').each((_: number, itemElement: any) => {
            const item = this.parseSourceMangaFromEntry($, itemElement)

            if (!item || seen.has(item.mangaId)) {
                return
            }

            seen.add(item.mangaId)
            results.push(item)
        })

        if (results.length > 0) {
            return
        }

        const directItem = this.parseSourceMangaFromEntry($, container)

        if (!directItem || seen.has(directItem.mangaId)) {
            return
        }

        seen.add(directItem.mangaId)
        results.push(directItem)
    }

    private parseSourceMangaFromEntry($: CheerioAPI, element: any): MangaWorldSourceManga | undefined {
        const link = $(element).find('a.manga-title, .name a, a.thumb, a[href*="/manga/"]').first()
        const href = link.attr('href') || $(element).find('a[href*="/manga/"]').first().attr('href')
        const mangaId = this.extractMangaId(href)

        if (!mangaId) {
            return undefined
        }

        const title = this.cleanText(link.attr('title'))
            || this.cleanText(link.text())
            || this.cleanText($(element).find('img').first().attr('alt'))

        if (!title) {
            return undefined
        }

        const image = this.absoluteUrl(
            $(element).find('img').first().attr('src')
                || $(element).find('img').first().attr('data-src')
                || this.extractFirstSrcFromSrcset($(element).find('img').first().attr('srcset'))
                || this.extractFirstSrcFromSrcset($(element).find('img').first().attr('data-srcset'))
        )
        const subtitle = this.extractEntrySubtitle($, element)

        return {
            mangaId,
            title,
            image,
            subtitle
        }
    }

    private extractEntrySubtitle($: CheerioAPI, element: any): string | undefined {
        const chapterBadge = this.cleanText($(element).find('.chapter').first().text())

        if (chapterBadge) {
            return this.prefixLatestChapter(chapterBadge)
        }

        const latestChapter = this.cleanText($(element).find('a.xanh').first().text())

        if (latestChapter) {
            return this.prefixLatestChapter(latestChapter)
        }

        const type = this.cleanText(
            $(element)
                .find('.genre')
                .first()
                .text()
                .replace(/^Tipo:\s*/i, '')
        )

        const status = this.cleanText(
            $(element)
                .find('.status')
                .first()
                .text()
                .replace(/^Stato:\s*/i, '')
        )

        if (type && status) {
            return `${type} • ${status}`
        }

        return type || status || undefined
    }

    private extractMetaValue($: CheerioAPI, label: string): string {
        let value = ''

        $('.meta-data .col-12, .meta-data .col-12.col-md-6, .meta-data div').each((_: number, element: any) => {
            const text = this.cleanText($(element).text())

            if (!text.startsWith(`${label}:`)) {
                return
            }

            value = this.cleanText(text.replace(`${label}:`, ''))
        })

        return value
    }

    private extractAnchorTexts($: CheerioAPI, selector: string): string[] {
        const values: string[] = []
        const seen = new Set<string>()

        $(selector).each((_: number, element: any) => {
            const value = this.cleanText($(element).text())

            if (!value || seen.has(value)) {
                return
            }

            seen.add(value)
            values.push(value)
        })

        return values
    }

    private extractMangaId(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        const match = url.match(/\/manga\/([^/]+\/[^/?#]+)/)

        return match?.[1]
    }

    private extractChapterId(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        const match = url.match(/\/read\/([^/?#]+)/)

        return match?.[1]
    }

    private extractQueryParam(url: string | undefined, key: string): string | undefined {
        if (!url) {
            return undefined
        }

        const match = url.match(new RegExp(`[?&]${key}=([^&#]+)`))

        return match ? decodeURIComponent(match[1]) : undefined
    }

    private normalizeChapterName(text: string): string {
        const chapterMatch = text.match(/Capitolo\s+(\d+(?:\.\d+)?)/i)

        if (!chapterMatch) {
            return text
        }

        const value = chapterMatch[1]
        const parsedValue = Number.parseFloat(value)
        const normalizedValue = Number.isFinite(parsedValue)
            ? this.formatChapterNumber(parsedValue)
            : value

        return `Capitolo ${normalizedValue}`
    }

    private parseChapterNumber(text: string): number | undefined {
        const match = text.match(/Capitolo\s+(\d+(?:\.\d+)?)/i)

        if (!match) {
            return undefined
        }

        const value = Number.parseFloat(match[1])

        return Number.isFinite(value) ? value : undefined
    }

    private parseNumber(text: string): number | undefined {
        const match = text.match(/(\d+(?:\.\d+)?)/)

        if (!match) {
            return undefined
        }

        const value = Number.parseFloat(match[1])

        return Number.isFinite(value) ? value : undefined
    }

    private parseItalianDate(text: string): Date | undefined {
        if (!text) {
            return undefined
        }

        const normalizedText = this.normalizeTextForMatch(text)
        const today = new Date()

        if (normalizedText === 'oggi') {
            return new Date(today.getFullYear(), today.getMonth(), today.getDate())
        }

        if (normalizedText === 'ieri') {
            return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
        }

        const relativeDaysMatch = normalizedText.match(/(\d+)\s+giorn[oi]\s+fa/)

        if (relativeDaysMatch) {
            const daysAgo = Number.parseInt(relativeDaysMatch[1], 10)

            if (Number.isFinite(daysAgo)) {
                return new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo)
            }
        }

        const months: Record<string, number> = {
            gennaio: 0,
            febbraio: 1,
            marzo: 2,
            aprile: 3,
            maggio: 4,
            giugno: 5,
            luglio: 6,
            agosto: 7,
            settembre: 8,
            ottobre: 9,
            novembre: 10,
            dicembre: 11
        }

        const match = normalizedText.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/)

        if (!match) {
            return undefined
        }

        const day = Number.parseInt(match[1], 10)
        const month = months[match[2]]
        const parsedYear = match[3] ? Number.parseInt(match[3], 10) : undefined
        const year = parsedYear !== undefined && Number.isFinite(parsedYear)
            ? parsedYear
            : today.getFullYear()

        if (!Number.isFinite(day) || month === undefined) {
            return undefined
        }

        return new Date(year, month, day)
    }

    private absoluteUrl(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        if (url.startsWith('//')) {
            return `https:${url}`
        }

        if (url.startsWith('/')) {
            return `${MANGA_WORLD_DOMAIN}${url}`
        }

        return url
    }

    private extractFirstSrcFromSrcset(srcset?: string): string | undefined {
        if (!srcset) {
            return undefined
        }

        return this.cleanText(srcset.split(',')[0]?.trim().split(/\s+/)[0]) || undefined
    }

    private formatChapterNumber(value: number): string {
        if (!Number.isInteger(value)) {
            return String(value)
        }

        return value < 10
            ? `0${value}`
            : String(value)
    }

    private isChapterPageImage(url: string): boolean {
        return url.includes('/chapters/') && /\.(jpg|jpeg|png|webp)(?:\?|$)/i.test(url)
    }

    private prefixLatestChapter(value: string): string {
        const normalizedValue = this.cleanText(value)

        if (/^(ultimo|latest):/i.test(normalizedValue)) {
            return normalizedValue
        }

        return /^capitolo\s+/i.test(normalizedValue)
            ? `Ultimo: ${normalizedValue}`
            : normalizedValue
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
