import * as cheerio from 'cheerio'

import type { Chapter } from '../models/Chapter'
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

    const image = absoluteUrl(
      $('.thumb img').first().attr('src') ??
      $('meta[property="og:image"]').attr('content') ??
      ''
    )

    const genres = $('.meta-data a').map((_, element) => {
      return $(element).text().trim()
    }).get().filter(Boolean)

    const chapters: Chapter[] = []

    $('.chapters-wrapper .chapter, .chapters-wrapper a').each((_, element) => {
      const anchor = $(element).find('a').first().length
        ? $(element).find('a').first()
        : $(element)

      const href = anchor.attr('href')
      const text = anchor.text().trim()

      if (!href || !text) {
        return
      }

      const url = absoluteUrl(href)
      const numberMatch = text.match(/(\d+(\.\d+)?)/)

      chapters.push({
        id: extractChapterId(url),
        title: text,
        number: Number(numberMatch?.[1] ?? 0),
        url,
      })
    })

    return {
      title,
      description,
      image,
      genres,
      chapters,
    }
  }
}
