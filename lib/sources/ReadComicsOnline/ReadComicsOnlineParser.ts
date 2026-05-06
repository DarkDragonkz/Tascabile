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
            const link = $(element).find('a[href*="/Comic/"]').first()
            const comicId = this.extractComicId(link.attr('href'))
            const title = this.cleanText($(element).find('span.title').first().text()) || this.cleanText(link.text())

            if (!comicId || !title || seen.has(comicId)) {
                return
            }

            const tooltipHtml = $(element).attr('title')
            const tooltipStatus = tooltipHtml ? this.extractTooltipValue(tooltipHtml, 'Status') : undefined

            seen.add(comicId)
            results.push({
                comicId,
                title,
                image: this.absoluteUrl($(element).find('img').first().attr('src')),
                subtitle: tooltipStatus
            })
        })

        return results
    }

    parseHomeLatestUpdates($: CheerioAPI): ReadComicsOnlineSourceComic[] {
        const results: ReadComicsOnlineSourceComic[] = []
        const seen = new Set<string>()

        $('.barTitle').each((_: number, titleElement: any) => {
            const sectionTitle = this.cleanText($(titleElement).text()).toLowerCase()

            if (!sectionTitle.includes('latest update')) {
                return
            }

            const content = $(titleElement).next('.barContent')

            content.find('a[href*="/Comic/"]').each((__: number, linkElement: any) => {
                const href = $(linkElement).attr('href')
                const comicId = this.extractComicId(href)

                if (!comicId || seen.has(comicId) || this.isIssueHref(href)) {
                    return
                }

                const title = this.cleanText($(linkElement).text())
                const subtitle = this.cleanText($(linkElement).nextAll('a.textDark').first().text())

                if (!title) {
                    return
                }

                seen.add(comicId)
                results.push({ comicId, title, subtitle: subtitle || undefined })
            })
        })

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
