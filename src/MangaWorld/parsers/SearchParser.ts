import * as cheerio from 'cheerio'

import type { Manga } from '../models/Manga'
import { getImageUrl } from '../utils/image'
import { absoluteUrl, extractMangaId } from '../utils/url'

export class SearchParser {
  parse(html: string): Manga[] {
    const $ = cheerio.load(html)

    const mangas: Manga[] = []

    $('.comics-grid .entry, .entry.search, .entry').each((_, element) => {
      const anchor = $(element).find('a[href*="/manga/"]').first()
      const image = $(element).find('img').first()

      const href = anchor.attr('href')
      const title = image.attr('alt') ?? anchor.attr('title') ?? anchor.text().trim()

      if (!href || !title) {
        return
      }

      const url = absoluteUrl(href)

      mangas.push({
        id: extractMangaId(url),
        title,
        image: getImageUrl(image),
        url,
      })
    })

    return mangas
  }
}
