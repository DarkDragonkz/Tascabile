import type { CheerioAPI } from 'cheerio'

const READ_COMICS_ONLINE_DOMAIN = 'https://readcomiconline.li'

export interface ReadComicsOnlineSourceComic {
    comicId: string
    title: string
    image?: string
    subtitle?: string
}

export interface ReadComicsOnlineComicDetails {
    id: string
    title: string
    image?: string
    description?: string
    genres: string[]
    publisher?: string
    writers: string[]
    artists: string[]
    status?: string
    year?: number
}

export interface ReadComicsOnlineChapter {
    id: string
    comicId: string
    name: string
    chapNum?: number
    time?: Date
}

export interface ReadComicsOnlineChapterDetails {
    id: string
    comicId: string
    pages: string[]
}

export class ReadComicsOnlineParser {
    parseSearchResults($: CheerioAPI): ReadComicsOnlineSourceComic[] {
        const results: ReadComicsOnlineSourceComic[] = []
        const seen = new Set<string>()

        $('div.item').each((_: number, element: any) => {
            const item = this.parseComicListItem($, element)

            if (!item || seen.has(item.comicId)) {
                return
            }

            seen.add(item.comicId)
            results.push(item)
        })

        return results
    }

    parseHomeLatestUpdates($: CheerioAPI): ReadComicsOnlineSourceComic[] {
        const results: ReadComicsOnlineSourceComic[] = []
        const seen = new Set<string>()

        const latestContainers = this.findLatestContainers($)

        for (const container of latestContainers) {
            this.parseComicLinksFromContainer($, container, results, seen)
        }

        if (results.length > 0) {
            return results
        }

        this.parseComicLinksFromContainer($, $('body'), results, seen)

        return results
    }

    parseComicDetails($: CheerioAPI, comicId: string): ReadComicsOnlineComicDetails {
        const title = this.cleanText($('a.bigChar').first().text()) || this.extractTitleFromPageTitle($) || comicId
        const publication = this.extractInfoValue($, 'Publication date')
        const year = publication ? Number.parseInt(publication, 10) : undefined

        return {
            id: comicId,
            title,
            image: this.absoluteUrl($('link[rel="image_src"]').first().attr('href') || $('.barContent img').first().attr('src')),
            description: this.extractSummary($),
            genres: this.extractAnchorTexts($, '.barContent a[href^="/Genre/"]'),
            publisher: this.extractAnchorTexts($, '.barContent a[href^="/Publisher/"]')[0],
            writers: this.extractAnchorTexts($, '.barContent a[href^="/Writer/"]'),
            artists: this.extractAnchorTexts($, '.barContent a[href^="/Artist/"]'),
            status: this.extractInfoValue($, 'Status'),
            year: year !== undefined && Number.isFinite(year) ? year : undefined
        }
    }

    parseChapters($: CheerioAPI, comicId: string): ReadComicsOnlineChapter[] {
        const chapters: ReadComicsOnlineChapter[] = []
        const seen = new Set<string>()

        $('table.listing tr').each((_: number, rowElement: any) => {
            const link = $(rowElement).find('a[href*="/Comic/"]').first()
            const id = this.extractChapterId(comicId, link.attr('href'))

            if (!id || seen.has(id)) {
                return
            }

            const name = this.normalizeChapterName(this.cleanText(link.text()))
            const dateText = this.cleanText($(rowElement).find('td').last().text())

            seen.add(id)
            chapters.push({
                id,
                comicId,
                name,
                chapNum: this.parseChapterNumber(name),
                time: this.parseDate(dateText)
            })
        })

        return chapters
    }

    parseChapterDetails($: CheerioAPI, comicId: string, chapterId: string): ReadComicsOnlineChapterDetails {
        const html = $.root().html() ?? ''

        return {
            id: chapterId,
            comicId,
            pages: this.extractPageImagesFromScripts(html)
        }
    }

    private findLatestContainers($: CheerioAPI): any[] {
        const containers: any[] = []

        $('.barTitle, .heading, .box-title, h1, h2, h3, h4').each((_: number, titleElement: any) => {
            const text = this.cleanText($(titleElement).text()).toLowerCase()

            if (!text.includes('latest')) {
                return
            }

            const nextContent = $(titleElement).next('.barContent, .box-content, .content, ul, table, div')

            if (nextContent.length > 0) {
                containers.push(nextContent)
            }

            const parent = $(titleElement).parent()

            if (parent.length > 0) {
                containers.push(parent)
            }
        })

        $('.barContent, .box-content, .content').each((_: number, containerElement: any) => {
            const text = this.cleanText($(containerElement).prev().text()).toLowerCase()

            if (text.includes('latest')) {
                containers.push($(containerElement))
            }
        })

        return containers
    }

    private parseComicLinksFromContainer($: CheerioAPI, container: any, results: ReadComicsOnlineSourceComic[], seen: Set<string>): void {
        container.find('a[href*="/Comic/"]').each((_: number, linkElement: any) => {
            const href = $(linkElement).attr('href')
            const comicId = this.extractComicId(href)

            if (!comicId || seen.has(comicId) || this.isIssueHref(href)) {
                return
            }

            const title = this.extractComicTitleFromLink($, linkElement)

            if (!title) {
                return
            }

            const itemContainer = $(linkElement).closest('li, tr, .item, .comic, .update, .row, div')
            const image = this.absoluteUrl(
                itemContainer.find('img').first().attr('src') ||
                $(linkElement).find('img').first().attr('src')
            )

            const subtitle = this.extractNearbyIssueText($, linkElement, comicId)

            seen.add(comicId)
            results.push({
                comicId,
                title,
                image,
                subtitle
            })
        })
    }

    private parseComicListItem($: CheerioAPI, element: any): ReadComicsOnlineSourceComic | undefined {
        const link = $(element).find('a[href*="/Comic/"]').first()
        const comicId = this.extractComicId(link.attr('href'))
        const tooltipHtml = $(element).attr('title')
        const tooltipTitle = tooltipHtml ? this.extractTooltipTitle(tooltipHtml) : undefined
        const title = tooltipTitle || this.cleanText($(element).find('span.title').first().text()) || this.cleanText(link.text())

        if (!comicId || !title) {
            return undefined
        }

        return {
            comicId,
            title,
            image: this.absoluteUrl($(element).find('img').first().attr('src')),
            subtitle: tooltipHtml ? this.extractTooltipValue(tooltipHtml, 'Status') : undefined
        }
    }

    private extractComicTitleFromLink($: CheerioAPI, linkElement: any): string {
        const link = $(linkElement)
        const directText = this.cleanText(link.clone().children().remove().end().text())
        const altText = this.cleanText(link.find('img').first().attr('alt'))
        const titleText = this.cleanText(link.attr('title'))
        const fullText = this.cleanText(link.text())

        return directText || altText || titleText || fullText
    }

    private extractNearbyIssueText($: CheerioAPI, linkElement: any, comicId: string): string | undefined {
        const link = $(linkElement)
        const candidates = [
            link.nextAll('a[href*="/Comic/"]').first(),
            link.closest('li, tr, .item, .comic, .update, .row, div').find(`a[href*="/Comic/${comicId}/"]`).first(),
            link.parent().find('a.textDark, a[href*="Issue"], a[href*="Annual"]').first()
        ]

        for (const candidate of candidates) {
            const text = this.cleanText(candidate.text())

            if (text) {
                return this.normalizeChapterName(text)
            }
        }

        return undefined
    }

    private extractSummary($: CheerioAPI): string | undefined {
        let summary = ''

        $('.barContent span.info').each((_: number, infoElement: any) => {
            const label = this.cleanText($(infoElement).text()).replace(':', '').toLowerCase()

            if (label !== 'summary') {
                return
            }

            summary = this.cleanText($(infoElement).parent().text().replace(/Summary:/i, ''))
        })

        return summary || undefined
    }

    private extractInfoValue($: CheerioAPI, label: string): string | undefined {
        let value: string | undefined

        $('.barContent p').each((_: number, paragraphElement: any) => {
            const text = this.cleanText($(paragraphElement).text())
            const prefix = `${label}:`

            if (!text.startsWith(prefix)) {
                return
            }

            value = this.cleanText(text.replace(prefix, '').replace(/Views:.*$/i, ''))
        })

        return value
    }

    private extractTooltipTitle(html: string): string | undefined {
        const cheerio = require('cheerio') as typeof import('cheerio')
        const $ = cheerio.load(html)

        return this.cleanText($('p.title').first().text()) || undefined
    }

    private extractTooltipValue(html: string, label: string): string | undefined {
        const cheerio = require('cheerio') as typeof import('cheerio')
        const $ = cheerio.load(html)
        const strong = $('strong')
            .filter((_: number, element: any) => this.cleanText($(element).text()).replace(':', '') === label)
            .first()

        if (strong.length === 0) {
            return undefined
        }

        return this.cleanText(strong.parent().text().replace(`${label}:`, '')) || undefined
    }

    private extractPageImagesFromScripts(html: string): string[] {
        const pages: string[] = []
        const seen = new Set<string>()
        const patterns = [
            /_NsXaOMixnz\s*=\s*'([^']+)'/g,
            /_kKFngEK\.push\('([^']+)'\)/g
        ]

        for (const pattern of patterns) {
            let match: RegExpExecArray | null

            while ((match = pattern.exec(html)) !== null) {
                const url = this.cleanText(match[1])

                if (!url || seen.has(url) || !this.isPageImageUrl(url)) {
                    continue
                }

                seen.add(url)
                pages.push(url)
            }
        }

        return pages
    }

    private isPageImageUrl(url: string): boolean {
        return /^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|webp)(?:\?|$)/i.test(url)
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

    private extractComicId(url?: string): string | undefined {
        return url?.match(/\/?Comic\/([^/?#]+)/i)?.[1]
    }

    private extractChapterId(comicId: string, url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        const escapedComicId = comicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        return url.match(new RegExp(`/Comic/${escapedComicId}/([^#]+)`, 'i'))?.[1]
    }

    private isIssueHref(url?: string): boolean {
        return !!url && /\/Comic\/[^/]+\/[^/]+/i.test(url)
    }

    private normalizeChapterName(text: string): string {
        const issueMatch = text.match(/Issue\s+#?(\d+(?:\.\d+)?)/i)

        if (issueMatch) {
            return `Issue #${issueMatch[1]}`
        }

        const annualMatch = text.match(/_?Annual\s+(\d{1,4})/i)

        if (annualMatch) {
            return `Annual ${annualMatch[1]}`
        }

        return text
    }

    private parseChapterNumber(text: string): number | undefined {
        const match = text.match(/(?:Issue\s+#?|Annual\s+)(\d+(?:\.\d+)?)/i)
        const value = match ? Number.parseFloat(match[1]) : undefined

        return value !== undefined && Number.isFinite(value) ? value : undefined
    }

    private parseDate(text: string): Date | undefined {
        const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

        if (!match) {
            return undefined
        }

        return new Date(Number.parseInt(match[3], 10), Number.parseInt(match[1], 10) - 1, Number.parseInt(match[2], 10))
    }

    private extractTitleFromPageTitle($: CheerioAPI): string | undefined {
        return this.cleanText($('title').first().text().match(/^(.*?)\s+comic\s+\|\s+Read/i)?.[1]) || undefined
    }

    private absoluteUrl(url?: string): string | undefined {
        if (!url) {
            return undefined
        }

        if (url.startsWith('//')) {
            return `https:${url}`
        }

        if (url.startsWith('/')) {
            return `${READ_COMICS_ONLINE_DOMAIN}${url}`
        }

        return url
    }

    private cleanText(value?: string): string {
        return (value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim()
    }
}
