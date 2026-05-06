import {
    ChapterDetails
} from '@paperback/types'

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
    status?: string
    artists: string[]
    writers: string[]
    genres: string[]
    publisher?: string
    year?: number
}

export interface ReadComicsOnlineChapter {
    id: string
    comicId: string
    name: string
    chapNum?: number
    time?: Date
}

const READ_COMICS_ONLINE_DOMAIN = 'https://readcomicsonline.ru'

export class ReadComicsOnlineParser {
    parseComicDetails($: any, mangaId: string): ReadComicsOnlineComicDetails {
        const rawTitle = $('h1, h2.listmanga-header, h2').first().text().replace(/\s+/g, ' ').trim()
        const titleFromPageTitle = $('title').text().replace(/\s+/g, ' ').replace(/\s+by\s+.*?\s+-\s+Info Page/i, '').trim()
        const title = rawTitle && !/chapters$/i.test(rawTitle) ? rawTitle : titleFromPageTitle

        const image =
            $('img[src*="/cover/"]').first().attr('src')
            || $('img[data-src*="/cover/"]').first().attr('data-src')
            || $('meta[property="og:image"]').attr('content')
            || $('link[rel="image_src"]').attr('href')

        const description =
            $('meta[name="description"]').attr('content')?.replace(/\s+/g, ' ').trim()
            || $('.summary, .description').first().text().replace(/\s+/g, ' ').trim()
            || ''

        const genres: string[] = []
        $('a[href*="/genre/"], a[href*="/Genre/"]').each((_: number, el: any) => {
            const genre = $(el).text().replace(/\s+/g, ' ').trim()
            if (genre && !genres.includes(genre)) genres.push(genre)
        })

        const status = this.readDefinitionValue($, 'Status')
        const publisher = this.readDefinitionValue($, 'Publisher') || this.extractKeywordPublisher($)
        const writer = this.readDefinitionValue($, 'Author') || this.readDefinitionValue($, 'Writer')
        const artist = this.readDefinitionValue($, 'Artist')

        return {
            id: mangaId,
            title: title || mangaId,
            image: this.toAbsoluteUrl(image),
            description,
            status: this.normalizeStatus(status),
            artists: this.splitList(artist),
            writers: this.splitList(writer),
            genres,
            publisher,
            year: this.extractYear($('body').text())
        }
    }

    parseChapters($: any, mangaId: string): ReadComicsOnlineChapter[] {
        const chapters: ReadComicsOnlineChapter[] = []
        const normalizedMangaId = this.normalizeId(mangaId)

        $('ul.chapters a[href*="/comic/"], a[href*="/comic/"]').each((_: number, el: any) => {
            const href = $(el).attr('href') ?? ''
            const parsed = this.parseChapterHref(href)
            if (!parsed || this.normalizeId(parsed.comicId) !== normalizedMangaId) return

            const name = $(el).text().replace(/\s+/g, ' ').trim()
            if (!name || chapters.some(chapter => chapter.id === parsed.chapterId)) return

            const dateText = $(el).closest('li').find('.date-chapter-title-rtl').first().text().replace(/\s+/g, ' ').trim()

            chapters.push({
                id: parsed.chapterId,
                comicId: mangaId,
                name: this.cleanChapterName(name),
                chapNum: this.extractChapterNumber(name, parsed.chapterId),
                time: this.parseDate(dateText)
            })
        })

        return chapters
    }

    parseChapterDetails(_html: string, mangaId: string, chapterId: string): ChapterDetails {
        return {
            id: chapterId,
            mangaId,
            pages: []
        } as ChapterDetails
    }

    parseSearchJson(json: any): ReadComicsOnlineSourceComic[] {
        const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : []

        return suggestions
            .map((suggestion: any) => {
                const comicId = String(suggestion?.data ?? '').trim()
                const title = String(suggestion?.value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

                if (!comicId || !title) return undefined

                return {
                    comicId,
                    title,
                    image: undefined,
                    subtitle: undefined
                } as ReadComicsOnlineSourceComic
            })
            .filter((item: ReadComicsOnlineSourceComic | undefined): item is ReadComicsOnlineSourceComic => item !== undefined)
    }

    parseSearchResults($: any): ReadComicsOnlineSourceComic[] {
        return this.parseComicCards($)
    }

    parseHomeLatestUpdates($: any): ReadComicsOnlineSourceComic[] {
        return this.parseComicCards($)
    }

    parseGridItems($: any): ReadComicsOnlineSourceComic[] {
        return this.parseComicCards($)
    }

    private parseComicCards($: any): ReadComicsOnlineSourceComic[] {
        const results: ReadComicsOnlineSourceComic[] = []
        const seen = new Set<string>()

        $('a[href*="/comic/"], a[href^="comic/"], a[href^="Comic/"], a[href*="/Comic/"]').each((_: number, el: any) => {
            const link = $(el)
            const href = link.attr('href') ?? ''
            const comicId = this.parseComicId(href)
            if (!comicId || seen.has(comicId)) return

            const container = link.closest('.media, li, div')
            const title = link.find('strong, span').first().text().replace(/\s+/g, ' ').trim()
                || link.text().replace(/\s+/g, ' ').trim()
                || container.find('img').first().attr('alt')?.replace(/\s+/g, ' ').trim()

            if (!title || title === '#') return

            const image =
                container.find('img').first().attr('data-src')
                || container.find('img').first().attr('src')

            const latest = container.find('a[href*="/comic/"]').filter((__: number, candidate: any) => {
                const candidateHref = $(candidate).attr('href') ?? ''
                return this.parseChapterHref(candidateHref)?.comicId === comicId
            }).last().text().replace(/\s+/g, ' ').trim()

            results.push({
                comicId,
                title,
                image: this.toAbsoluteUrl(image),
                subtitle: latest || undefined
            })
            seen.add(comicId)
        })

        return results
    }

    private parseComicId(href: string): string | undefined {
        const clean = href.trim().replace(READ_COMICS_ONLINE_DOMAIN, '').replace(/^https?:\/\/readcomicsonline\.ru/i, '')
        const match = clean.match(/\/?[Cc]omic\/([^/?#]+)(?:[?#].*)?$/)

        return match?.[1]
    }

    private parseChapterHref(href: string): { comicId: string, chapterId: string } | undefined {
        const clean = href.trim().replace(READ_COMICS_ONLINE_DOMAIN, '').replace(/^https?:\/\/readcomicsonline\.ru/i, '')
        const match = clean.match(/\/?[Cc]omic\/([^/?#]+)\/([^?#]+)(?:[?#].*)?$/)

        if (!match?.[1] || !match?.[2]) return undefined

        return {
            comicId: match[1],
            chapterId: match[2]
        }
    }

    private readDefinitionValue($: any, label: string): string | undefined {
        let value: string | undefined

        $('dt').each((_: number, el: any) => {
            const currentLabel = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase()
            if (currentLabel !== label.toLowerCase()) return

            value = $(el).next('dd').text().replace(/\s+/g, ' ').trim()
        })

        return value
    }

    private extractKeywordPublisher($: any): string | undefined {
        const keywords = $('meta[name="keywords"]').attr('content') ?? ''
        const parts = keywords.split(',').map(part => part.trim()).filter(Boolean)

        return parts.length > 2 ? parts[2] : undefined
    }

    private normalizeStatus(status?: string): string {
        const normalized = (status ?? '').toLowerCase()

        if (normalized.includes('complete')) return 'Completed'
        if (normalized.includes('ongoing')) return 'Ongoing'
        if (normalized.includes('hiatus')) return 'Hiatus'

        return 'Unknown'
    }

    private cleanChapterName(name: string): string {
        return name.replace(/^Chapter\s+/i, '').replace(/^[^#]+#/, '#').trim()
    }

    private extractChapterNumber(name: string, chapterId: string): number | undefined {
        const numericMatch = name.match(/#?\s*(\d+(?:\.\d+)?)/) || chapterId.match(/(?:Issue|Chapter|Omnibus)(\d+(?:\.\d+)?)/i)

        return numericMatch ? Number(numericMatch[1]) : undefined
    }

    private parseDate(value?: string): Date | undefined {
        if (!value) return undefined

        const parsed = new Date(value)
        return Number.isNaN(parsed.getTime()) ? undefined : parsed
    }

    private splitList(value?: string): string[] {
        if (!value) return []

        return value.split(/,|\n/).map(item => item.trim()).filter(Boolean)
    }

    private normalizeId(id: string): string {
        return id.trim().toLowerCase()
    }

    private toAbsoluteUrl(url?: string): string | undefined {
        if (!url) return undefined

        const clean = url.trim()
        if (clean.startsWith('http://') || clean.startsWith('https://')) return clean
        if (clean.startsWith('//')) return `https:${clean}`
        if (clean.startsWith('/')) return `${READ_COMICS_ONLINE_DOMAIN}${clean}`

        return `${READ_COMICS_ONLINE_DOMAIN}/${clean.replace(/^\.\.?\//, '')}`
    }

    private extractYear(text: string): number | undefined {
        const match = text.match(/(19|20)\d{2}/)

        return match ? Number(match[0]) : undefined
    }
}
