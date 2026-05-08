import {
    Chapter,
    ChapterDetails,
    HomeSection,
    HomeSectionType,
    SourceManga,
    PartialSourceManga,
    Tag,
    TagSection,
} from '@paperback/types'

const BASE_URL = 'https://batcave.biz'

export class BatCaveParser {

    private getHighResImage(url: string | undefined): string {
        if (!url) return ''
        if (url.startsWith('/')) url = BASE_URL + url
        if (url.includes('/thumbs/')) url = url.replace('/thumbs/', '/')
        return url
    }

    parseGridItems($: any, selector: string, subtitleSelector?: string): PartialSourceManga[] {
        const items: PartialSourceManga[] = []
        const seen = new Set<string>()
        
        $(selector).each((_: any, item: any) => {
            const link = $(item).is('a') ? $(item) : $('a', item).first()
            const href = link.attr('href')
            const id = this.extractMangaId(href)
            
            const title = $('.poster__title, .latest__title a, .readed__title a, .popular__title', item).first().text().trim() || link.text().trim()
            const rawImage = $('img', item).attr('data-src') ?? $('img', item).attr('src')
            const image = this.getHighResImage(rawImage)

            let subtitle: string | undefined = undefined
            if (subtitleSelector) {
                const subText = $(subtitleSelector, item).text().trim()
                subtitle = subText ? subText.replace(/chapter\s*/i, 'Ch. ').trim() : 'Comic'
            } else {
                const posterSubtitle = $('.poster__subtitle li', item).map((__: any, li: any) => $(li).text().trim()).get().filter(Boolean).join(' • ')
                subtitle = posterSubtitle || undefined
            }

            if (id && title && !seen.has(id)) {
                seen.add(id)
                items.push(App.createPartialSourceManga({
                    mangaId: id,
                    image: image,
                    title: title,
                    subtitle: subtitle
                }))
            }
        })

        return items
    }

    private extractMangaId(href: string | undefined): string | undefined {
        if (!href) return undefined

        const cleanHref = href.split('#')[0]?.split('?')[0] ?? ''
        const lastPathPart = cleanHref.split('/').filter(Boolean).pop()

        if (!lastPathPart || !lastPathPart.endsWith('.html')) return undefined

        return lastPathPart
    }

    parseMangaDetails($: any, mangaId: string): SourceManga {
        const title = $('h1.main-page-title').text().trim() || $('h1').first().text().trim() || 'Unknown'
        const rawImage = $('.page__poster img').attr('src')
        const image = this.getHighResImage(rawImage)
        const desc = $('.page__text').text().trim()
        
        let author = 'Unknown'
        let artist = 'Unknown'
        let status = 'Ongoing'

        $('.page__list li').each((_: any, li: any) => {
            const text = $(li).text().trim()
            const lowerText = text.toLowerCase()

            if (text.includes('Writer:')) {
                author = text.replace('Writer:', '').trim()
            }
            if (text.includes('Artist:')) {
                artist = text.replace('Artist:', '').trim()
            }
            if (text.includes('Release type:')) {
                if (lowerText.includes('completed') || lowerText.includes('finished')) {
                    status = 'Completed'
                } else if (lowerText.includes('ongoing') || lowerText.includes('publishing')) {
                    status = 'Ongoing'
                }
            }
        })

        const arrayTags: Tag[] = []
        $('.page__tags a').each((_: any, a: any) => {
            const label = $(a).text().trim()
            const hrefParts = $(a).attr('href')?.split('/')
            const id = hrefParts ? hrefParts[hrefParts.length - 2] : label
            if (label) arrayTags.push(App.createTag({ id: id ?? label, label }))
        })
        const tagSections: TagSection[] = [App.createTagSection({ id: '0', label: 'Genres', tags: arrayTags })]

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [title],
                image: image,
                status: status,
                author: author,
                artist: artist,
                tags: tagSections,
                desc: desc
            })
        })
    }

    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    parseChapters(html: string): Chapter[] {
        const chapters: Chapter[] = []
        const scriptData = html.match(/window\.__DATA__\s*=\s*({.*?});/s)
        
        const seriesTitleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
        let seriesNameRaw = seriesTitleMatch ? seriesTitleMatch[1].replace(/<[^>]+>/g, '').trim() : ''
        const seriesBaseName = seriesNameRaw.replace(/\s*\(\d{4}[-–—]?\).*$/, '').trim()

        if (!scriptData) return []

        try {
            const data = JSON.parse(scriptData[1])
            if (data.chapters && Array.isArray(data.chapters)) {
                for (const chap of data.chapters) {
                    const id = String(chap.id)
                    let rawTitle = (chap.title || '').trim()
                    
                    let chapNum = 0
                    if (chap.posi) {
                        chapNum = parseFloat(chap.posi)
                    } else {
                        const numMatch = rawTitle.match(/(\d+(\.\d+)?)/g)
                        if (numMatch) chapNum = parseFloat(numMatch[numMatch.length - 1] ?? '0')
                    }

                    let volNum: string | undefined = undefined
                    const volMatch = rawTitle.match(/(?:Vol\.?|TPB|Book)[_\s]*(\d+)/i)
                    if (volMatch) {
                        volNum = volMatch[1]
                    }

                    let cleanTitle = ''
                    if (rawTitle.includes('#')) {
                        const parts = rawTitle.split('#')
                        cleanTitle = parts.slice(1).join('#').trim()
                    } else {
                        cleanTitle = rawTitle
                        if (seriesBaseName.length > 0) {
                            const seriesRegex = new RegExp(`^${this.escapeRegExp(seriesBaseName)}`, 'i')
                            cleanTitle = cleanTitle.replace(seriesRegex, '').trim()
                        }
                        cleanTitle = cleanTitle.replace(/^(chapter|ch\.?|no\.?)\s*\d+(\.\d+)?/i, '').trim()
                        cleanTitle = cleanTitle.replace(/(?:Vol\.?|TPB|Book)[_\s]*\d+/i, '').trim()
                        cleanTitle = cleanTitle
                            .replace(/_/g, ' ')
                            .replace(/^\s*[-–—]+\s*/, '')
                            .replace(/\s*[-–—]+\s*$/, '')
                            .replace(/\s+/g, ' ')
                            .trim()
                    }

                    let finalName = ''
                    if (cleanTitle.length > 0 && cleanTitle !== String(chapNum)) {
                         finalName = cleanTitle
                    }
                    
                    const pagesCount = chap.pages || chap.count
                    if (pagesCount) {
                        if (finalName.length > 0) {
                            finalName += ` (${pagesCount}p)`
                        } else {
                            finalName = `(${pagesCount}p)`
                        }
                    }

                    let time = new Date()
                    if (chap.date) {
                        const parts = chap.date.split('.')
                        if (parts.length === 3) {
                            time = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
                        } else {
                            const tryDate = new Date(chap.date)
                            if (!isNaN(tryDate.getTime())) time = tryDate
                        }
                    }

                    chapters.push(App.createChapter({
                        id: id,
                        name: finalName,
                        chapNum: chapNum,
                        volume: volNum ? parseFloat(volNum) : undefined,
                        time: time,
                        langCode: 'en'
                    }))
                }
            }
        } catch (e) {
            console.error(`BatCave: Error parsing chapters JSON: ${e}`)
        }

        return chapters.sort((a, b) => b.chapNum - a.chapNum)
    }

    parseChapterDetails(html: string, mangaId: string, chapterId: string): ChapterDetails {
        const pages: string[] = []
        const scriptData = html.match(/window\.__DATA__\s*=\s*({.*?});/s)
        
        if (scriptData) {
            try {
                const data = JSON.parse(scriptData[1])
                if (data.images && Array.isArray(data.images)) {
                    for (const img of data.images) {
                         if (img && !img.includes('logo') && !img.includes('icon')) {
                             let cleanImg = img
                             if (cleanImg.startsWith('//')) cleanImg = 'https:' + cleanImg
                             else if (cleanImg.startsWith('/')) cleanImg = BASE_URL + cleanImg
                             pages.push(cleanImg)
                         }
                    }
                }
            } catch (e) {
                console.error(`BatCave: Error parsing images JSON: ${e}`)
            }
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })
    }

    parseHomeSections($: any, sectionCallback: (section: HomeSection) => void): void {
        const featuredItems = this.parseGridItems($, '.sect--popular a.poster, #owl-carou a.poster')
        sectionCallback(App.createHomeSection({ 
            id: 'featured', 
            title: 'Featured Comics 🔥', 
            containsMoreItems: false, 
            type: HomeSectionType.singleRowLarge,
            items: featuredItems
        }))

        const hotItems = this.parseGridItems($, '.sect--hot a.poster')
        sectionCallback(App.createHomeSection({ 
            id: 'hot', 
            title: 'Hot New Releases ⚡', 
            containsMoreItems: false, 
            type: HomeSectionType.singleRowNormal,
            items: hotItems
        }))
        
        const topRatedItems = this.parseGridItems($, 'div.side-block:has(h2:contains("Top-rated")) a.popular, div.side-block:has(.side-block__title:contains("Top-rated")) a.popular')
        sectionCallback(App.createHomeSection({ 
            id: 'top_rated', 
            title: 'Top Rated ⭐', 
            containsMoreItems: false, 
            type: HomeSectionType.singleRowNormal,
            items: topRatedItems
        }))

        const justAddedItems = this.parseGridItems($, 'div.side-block:has(h2:contains("Just added")) a.popular, div.side-block:has(.side-block__title:contains("Just added")) a.popular')
        sectionCallback(App.createHomeSection({ 
            id: 'just_added', 
            title: 'Just Added 🆕', 
            containsMoreItems: false, 
            type: HomeSectionType.singleRowNormal,
            items: justAddedItems
        }))

        const latestItems = this.parseGridItems($, '.sect--latest .latest, .content .short', '.latest__chapter')
        sectionCallback(App.createHomeSection({ 
            id: 'latest', 
            title: 'Latest Updates 🆙', 
            containsMoreItems: true, 
            type: HomeSectionType.doubleRow,
            items: latestItems
        }))
    }

    parseSearchResults($: any): PartialSourceManga[] {
        let results = this.parseGridItems($, '.readed') 
        if (results.length === 0) {
            results = this.parseGridItems($, '.sect--latest .latest')
        }
        return results
    }
}
