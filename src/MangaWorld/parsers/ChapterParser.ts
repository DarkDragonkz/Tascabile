import * as cheerio from 'cheerio'

import { JsonParser } from './JsonParser'

export class ChapterParser {
  private readonly jsonParser = new JsonParser()

  parsePages(html: string): string[] {
    const entries = this.jsonParser.getWindowEntries(html)
    const chapterData = this.jsonParser.getChapterPagesData(entries)

    const cdn = chapterData?.CDN_URL
    const pages = chapterData?.pages

    if (cdn && pages) {
      const singleChapter = pages.singleChapters?.find((chapter) => Array.isArray(chapter.pages))

      if (singleChapter?.pages?.length) {
        return singleChapter.pages.map((page) => `${cdn}${page}`)
      }

      for (const volume of pages.volumes ?? []) {
        for (const chapter of volume.chapters ?? []) {
          if (chapter.pages?.length) {
            return chapter.pages.map((page) => `${cdn}${page}`)
          }
        }
      }
    }

    return this.parseHtmlPages(html)
  }

  private parseHtmlPages(html: string): string[] {
    const $ = cheerio.load(html)

    const pages: string[] = []

    $('img.page-image').each((_, element) => {
      const src =
        $(element).attr('data-src') ??
        $(element).attr('data-original') ??
        $(element).attr('src')

      if (src) {
        pages.push(src)
      }
    })

    return pages
  }
}
