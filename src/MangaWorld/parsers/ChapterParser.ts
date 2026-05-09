import * as cheerio from 'cheerio'

export class ChapterParser {
  parsePages(html: string): string[] {
    const $ = cheerio.load(html)

    const pages: string[] = []

    $('img.page-image').each((_, element) => {
      const src = $(element).attr('src')

      if (src) {
        pages.push(src)
      }
    })

    return pages
  }
}
