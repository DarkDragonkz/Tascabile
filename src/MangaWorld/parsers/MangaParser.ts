import * as cheerio from 'cheerio'

import type { Chapter } from '../models/Chapter'
import { getImageUrl } from '../utils/image'
import { absoluteUrl, extractChapterId } from '../utils/url'

export interface MangaDetails {
  title: string
  description: string
  image: string
  genres: string[]
  chapters: Chapter[]
}

export class MangaParser {
  parse(html: string): MangaDetails {
    const $ = cheerio.load(html)

    const title = $('.comic-info h1').first().text().trim()
    const description = $('#noidungm').text().trim()

    const image = getImageUrl($('.thumb img').first()) || absoluteUrl(
      $('meta[property="og:image"]').attr('content') ?? ''
    )

    const genres = $('.meta-data .badge[href*="genre="]').map((_, element) => {
      return $(element).text().trim()
    }).get().filter(Boolean)

    const chaptersMap = new Map<string, Chapter>()

    $('.chapters-wrapper a[href*="/read/"]').each((_, element) => {
      const anchor = $(element)

      const href = anchor.attr('href')
      const text = anchor.text().trim()

      if (!href || !text) {
        return
      }

      const url = absoluteUrl(href)
      const id = extractChapterId(url)
      const numberMatch = text.match(/(\d+(\.\d+)?)/)

      chaptersMap.set(id, {
        id,
        title: text,
        number: Number(numberMatch?.[1] ?? 0),
        url,
      })
    })

    const chapters = [...chaptersMap.values()].sort((a, b) => a.number - b.number)

    return {
      title,
      description,
      image,
      genres,
      chapters,
    }
  }
}
