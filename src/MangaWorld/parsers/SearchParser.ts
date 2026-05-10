import * as cheerio from 'cheerio'

import type { Manga } from '../models/Manga'
import type { MangaWorldGenre, MangaWorldMangaJson } from '../models/WindowEntry'
import { getImageUrl } from '../utils/image'
import { absoluteUrl, extractMangaId } from '../utils/url'
import { JsonParser } from './JsonParser'

export class SearchParser {
  private readonly jsonParser = new JsonParser()

  parse(html: string): Manga[] {
    return this.parseJson(html) ?? this.parseHtml(html)
  }

  private parseJson(html: string): Manga[] | undefined {
    const entries = this.jsonParser.getWindowEntries(html)
    const searchEntry = entries.find((entry) => entry.kind === 'search')

    if (!searchEntry) return undefined

    const data = searchEntry.data as {
      mangas?: MangaWorldMangaJson[]
    }

    if (!data.mangas?.length) return []

    return data.mangas.map((manga) => {
      const id = `${manga.linkId ?? manga.id ?? ''}/${manga.slug ?? ''}`.replace(/^\/+|\/+$/g, '')
      const genres = manga.genres?.map((genre: MangaWorldGenre) => genre.name ?? genre.slug ?? '').filter(Boolean) ?? []

      return {
        id,
        title: manga.title ?? '',
        image: manga.imageT ?? manga.image ?? '',
        subtitle: genres.slice(0, 3).join(', ') || manga.author?.join(', '),
        url: `${absoluteUrl(`/manga/${id}`)}`,
      }
    }).filter((manga) => manga.id && manga.title)
  }

  private parseHtml(html: string): Manga[] {
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
