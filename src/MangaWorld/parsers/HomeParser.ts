import * as cheerio from 'cheerio'

import type { Manga } from '../models/Manga'
import { absoluteUrl, extractChapterId, extractMangaId } from '../utils/url'

export interface MangaUpdate extends Manga {
  chapterId?: string
  chapterTitle?: string
}

export class HomeParser {
  parsePopular(html: string): MangaUpdate[] {
    return this.parseTrending(html)
  }

  parseTrending(html: string): MangaUpdate[] {
    return this.parseCards(html, '#chapters-slide .entry.vertical', true)
  }

  parseLatest(html: string): MangaUpdate[] {
    return this.parseCards(html, '.comics-grid .entry', true)
  }

  private parseCards(html: string, selector: string, includeChapter: boolean): MangaUpdate[] {
    const $ = cheerio.load(html)
    const mangas: MangaUpdate[] = []

    $(selector).each((_, element) => {
      const root = $(element)
      const mangaAnchor = root.find('a[href*="/manga/"]').first()
      const image = root.find('img').first()
      const href = mangaAnchor.attr('href')
      const title = image.attr('alt') ?? mangaAnchor.attr('title') ?? mangaAnchor.text().trim()
      const imageUrl = image.attr('src') ?? image.attr('data-src')

      if (!href || !title) return

      const url = absoluteUrl(href)
      const chapterAnchor = includeChapter
        ? root.find('a[href*="/read/"]').first()
        : undefined
      const chapterHref = chapterAnchor?.attr('href')
      const chapterTitle = chapterAnchor?.text().trim() || root.find('.chapter').first().text().trim()

      mangas.push({
        id: extractMangaId(url),
        title,
        image: imageUrl ? absoluteUrl(imageUrl) : '',
        subtitle: chapterTitle || undefined,
        url,
        chapterId: chapterHref ? extractChapterId(chapterHref) : undefined,
        chapterTitle: chapterTitle || undefined,
      })
    })

    return mangas
  }
}
