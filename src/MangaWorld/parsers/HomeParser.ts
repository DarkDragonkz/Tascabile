import * as cheerio from 'cheerio'

import type { Manga } from '../models/Manga'
import { absoluteUrl, extractMangaId } from '../utils/url'

export class HomeParser {
  parsePopular(html: string): Manga[] {
    const $ = cheerio.load(html)

    const mangas: Manga[] = []

    $('#chapters-slide .entry.vertical').each((_, element) => {
      const anchor = $(element).find('a').first()
      const image = $(element).find('img').first()

      const href = anchor.attr('href')
      const title = image.attr('alt') ?? anchor.attr('title') ?? ''
      const imageUrl = image.attr('src')

      if (!href || !title) {
        return
      }

      const url = absoluteUrl(href)

      mangas.push({
        id: extractMangaId(url),
        title,
        image: imageUrl ? absoluteUrl(imageUrl) : '',
        url,
      })
    })

    return mangas
  }
}
