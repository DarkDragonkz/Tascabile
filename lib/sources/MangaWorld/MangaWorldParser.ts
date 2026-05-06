import type { CheerioAPI } from 'cheerio'

export interface MangaWorldSourceManga {
    mangaId: string
    title: string
    image?: string
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

            const sectionTitle = $(headingElement).closest('.s-title')
            const candidateContainers = [
                sectionTitle.next(),
                sectionTitle.nextAll('.comics-grid, .comics-flex, .row, .swiper, .carousel').first(),
                sectionTitle.parent(),
                sectionTitle.parent().next(),
                sectionTitle.closest('section'),
                sectionTitle.closest('.col-12, .col-sm-12, .col-md-8, .col-xl-9'),
                $(headingElement).parent().next(),
                $(headingElement).parent()
            ]

            for (const container of candidateContainers) {
                container.find('.entry, .entry.vertical').each((__: number, itemElement: any) => {
                    const item = this.parseSourceMangaFromEntry($, itemElement)

                    if (!item || seen.has(item.mangaId)) {
                        return
                    }

                    seen.add(item.mangaId)
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

        $('#page img.page-image, #page img.img-fluid, #page img').each((_: number, element: any) => {
            const src = this.absoluteUrl($(element).attr('src'))

            if (!src || seen.has(src)) {
                return
            }

            if (!src.includes('/chapters/')) {
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

    private parseSourceMangaFromEntry($: CheerioAPI, element: any): MangaWorldSourceManga | undefined {
        const link = $(element).find('a.manga-title, .name a, a.thumb').first()
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

        const image = this.absoluteUrl($(element).find('img').first().attr('src'))

        return {
            mangaId,
            title,
            image
        }
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
        const normalizedValue = value.length > 2 && value.startsWith('0')
            ? value.slice(0, 2)
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

        const match = text.toLowerCase().match(/(\d{1,2})\s+([a-zà]+)/)

        if (!match) {
            return undefined
        }

        const day = Number.parseInt(match[1], 10)
        const month = months[match[2]]

        if (!Number.isFinite(day) || month === undefined) {
            return undefined
        }

        const currentYear = new Date().getFullYear()

        return new Date(currentYear, month, day)
    }

    private absoluteUrl(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        if (url.startsWith('//')) {
            return `https:${url}`
        }

        if (url.startsWith('/')) {
            return `https://www.mangaworld.mx${url}`
        }

        return url
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
