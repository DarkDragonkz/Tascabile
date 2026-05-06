import {
   Chapter,
   ChapterDetails,
   PartialSourceManga,
   SourceManga
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
const READ_COMICS_ONLINE_DOMAIN = 'https://readcomiconline.li'
export class ReadComicsOnlineParser {
   parseComicDetails($: any, mangaId: string): ReadComicsOnlineComicDetails {
       const title = $('div.heading h3, .barContent h1, h1').first().text().trim()
           || $('title').text().replace(/\s+/g, ' ').trim()
       const image =
           $('meta[property="og:image"]').attr('content')
           || $('link[rel="image_src"]').attr('href')
           || $('img').first().attr('src')
       const description =
           $('div.manga-summary, div.summary, div#div_desc, p').first().text().trim()
           || $('meta[name="description"]').attr('content')
           || ''
       const infoText = $('body').text()
       const genres: string[] = []
       $('a[href*="/Genre/"]').each((_: number, el: any) => {
           const g = $(el).text().trim()
           if (g) genres.push(g)
       })
       return {
           id: mangaId,
           title: title || mangaId,
           image: this.toAbsoluteUrl(image),
           description,
           status: /status:\s*completed/i.test(infoText) ? 'Completed'
               : /status:\s*ongoing/i.test(infoText) ? 'Ongoing'
               : 'Unknown',
           artists: this.extractLabeledList(infoText, 'Artist'),
           writers: this.extractLabeledList(infoText, 'Writer'),
           genres,
           publisher: this.extractLabeledValue(infoText, 'Publisher'),
           year: this.extractYear(infoText)
       }
   }
   parseChapters($: any, mangaId: string): ReadComicsOnlineChapter[] {
       const chapters: ReadComicsOnlineChapter[] = []
       $('a[href*="/Comic/"]').each((_: number, el: any) => {
           const href = $(el).attr('href') ?? ''
           if (!href.includes(`/Comic/${mangaId}/`)) return
           const parts = href.split('/').filter(Boolean)
           const chapterId = parts[parts.length - 1]?.split('?')[0]
           if (!chapterId || chapterId.toLowerCase() === mangaId.toLowerCase()) return
           const name = $(el).text().trim()
           if (!name) return
           if (chapters.some(ch => ch.id === chapterId)) return
           const numMatch = name.match(/(\d+(\.\d+)?)/)
           chapters.push({
               id: chapterId,
               comicId: mangaId,
               name,
               chapNum: numMatch ? Number(numMatch[1]) : undefined,
               time: undefined
           })
       })
       return chapters.reverse()
   }
   parseChapterDetails(html: string, mangaId: string, chapterId: string): ChapterDetails {
       const pages = this.extractReaderPages(html)
       return App.createChapterDetails({
           id: chapterId,
           mangaId,
           pages
       })
   }
   parseSearchResults($: any): ReadComicsOnlineSourceComic[] {
       const results: ReadComicsOnlineSourceComic[] = []
       $('.list-comic .item, .item').each((_: number, el: any) => {
           const link = $(el).find('a').first()
           const href = link.attr('href') ?? ''
           const title = link.attr('title')?.trim() || link.text().trim()
           const comicId = href.split('/Comic/')[1]?.split('?')[0]?.split('/')[0]
           if (!comicId || !title) return
           const image =
               $(el).find('img').attr('src')
               || $(el).find('img').attr('data-src')
               || $(el).find('img').attr('data-original')
           results.push({
               comicId,
               title,
               image: this.toAbsoluteUrl(image),
               subtitle: undefined
           })
       })
       return results
   }
   parseHomeLatestUpdates($: any): ReadComicsOnlineSourceComic[] {
       return this.parseSearchResults($)
   }
   // -------------------------
   // Reader extraction
   // -------------------------
   private extractReaderPages(html: string): string[] {
       const rawPages: string[] = []
       // Formato "vecchio"
       for (const match of html.matchAll(/_NsXaOMixnz\s*=\s*['"]([^'"]+)['"]/g)) {
           rawPages.push(match[1])
       }
       // Altri formati possibili
       for (const match of html.matchAll(/_0ESoWptGk\.push\(\s*['"]([^'"]+)['"]\s*\)/g)) {
           rawPages.push(match[1])
       }
       for (const match of html.matchAll(/_lstImgs\.push\(\s*['"]([^'"]+)['"]\s*\)/g)) {
           rawPages.push(match[1])
       }
       for (const match of html.matchAll(/_lstImages\.push\(\s*['"]([^'"]+)['"]\s*\)/g)) {
           rawPages.push(match[1])
       }
       const decoded = rawPages
           .map(page => this.decodeReaderUrl(page))
           .map(page => page.trim())
           .filter(page => this.isRealPage(page))
       return [...new Set(decoded)]
   }
   private decodeReaderUrl(input: string): string {
       let value = input
           .replace(/Vz__x2OdwP_/g, 'g')
           .replace(/pw_.g28x/g, 'b')
           .replace(/d2pr.x_27/g, 'h')
           .trim()
       // Se è già un URL valido, basta restituirlo
       if (/^https?:\/\//i.test(value)) {
           return value
       }
       // Replica della logica baeu() del sito
       if (!value.includes('?')) {
           return value
       }
       const query = value.substring(value.indexOf('?'))
       const marker = value.includes('=s0?') ? '=s0?' : '=s1600?'
       const markerIndex = value.indexOf(marker)
       if (markerIndex === -1) {
           return value
       }
       let core = value.substring(0, markerIndex)
       core = this.step1(core)
       core = this.step2(core)
       try {
           core = Buffer.from(core, 'base64').toString('utf8')
       } catch {
           return value
       }
       if (core.length < 18) {
           return value
       }
       core = core.substring(0, 13) + core.substring(17)
       core = core.substring(0, core.length - 2) + (value.includes('=s0?') ? '=s0' : '=s1')
       return `https://2.bp.blogspot.com/${core}${query}`
   }
   private step1(value: string): string {
       return value.substring(15, 15 + 18) + value.substring(15 + 18 + 17)
   }
   private step2(value: string): string {
       return value.substring(0, value.length - 11) + value[value.length - 2] + value[value.length - 1]
   }
   private isRealPage(url: string): boolean {
       if (!url) return false
       if (url.length < 20) return false
       if (!/^https?:\/\//i.test(url)) return false
       const lower = url.toLowerCase()
       if (lower.includes('/content/images/')) return false
       if (lower.includes('blank.gif')) return false
       if (lower.includes('loading.gif')) return false
       if (lower.includes('error.png')) return false
       if (lower.includes('logo.png')) return false
       return true
   }
   private toAbsoluteUrl(url?: string): string | undefined {
       if (!url) return undefined
       if (url.startsWith('http://') || url.startsWith('https://')) return url
       if (url.startsWith('//')) return `https:${url}`
       if (url.startsWith('/')) return `${READ_COMICS_ONLINE_DOMAIN}${url}`
       return `${READ_COMICS_ONLINE_DOMAIN}/${url}`
   }
   private extractLabeledValue(text: string, label: string): string | undefined {
       const re = new RegExp(`${label}\\s*:\\s*([^\\n\\r]+)`, 'i')
       return text.match(re)?.[1]?.trim()
   }
   private extractLabeledList(text: string, label: string): string[] {
       const value = this.extractLabeledValue(text, label)
       if (!value) return []
       return value.split(',').map(v => v.trim()).filter(Boolean)
   }
   private extractYear(text: string): number | undefined {
       const match = text.match(/publication date:\s*.*?(\d{4})/i)
       return match ? Number(match[1]) : undefined
   }
}
