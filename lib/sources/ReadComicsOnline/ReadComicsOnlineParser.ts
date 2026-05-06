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
           const chapterId = parts[parts.length - 1]
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

   parseChapterDetails(_html: string, mangaId: string, chapterId: string): ChapterDetails {
       return {
           id: chapterId,
           mangaId,
           pages: []
       } as ChapterDetails
   }

   parseSearchResults($: any): ReadComicsOnlineSourceComic[] {
       const results: ReadComicsOnlineSourceComic[] = []
       const seen = new Set<string>()

       $('.list-comic .item, .item').each((_: number, el: any) => {
           const link = $(el).find('a[href*="/Comic/"]').first()
           const href = link.attr('href') ?? ''
           const title = link.attr('title')?.trim()
               || link.find('.title').first().text().trim()
               || link.text().trim()

           const comicId = href.split('/Comic/')[1]?.split('?')[0]?.split('/')[0]
           if (!comicId || !title || seen.has(comicId)) return

           const image =
               $(el).find('img').attr('src')
               || $(el).find('img').attr('data-src')
               || $(el).find('img').attr('data-original')

           results.push({
               comicId,
               title,
               image: this.toAbsoluteUrl(image),
               subtitle: this.extractSearchSubtitle($(el).attr('title'))
           })
           seen.add(comicId)
       })

       return results
   }

   parseHomeLatestUpdates($: any): ReadComicsOnlineSourceComic[] {
       return this.parseSearchResults($)
   }

   private extractSearchSubtitle(titleAttribute?: string): string | undefined {
       if (!titleAttribute) return undefined

       const statusMatch = titleAttribute.match(/<strong>Status:\s*<\/strong>\s*([^<]+)/i)
       if (statusMatch?.[1]) return statusMatch[1].trim()

       return undefined
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
