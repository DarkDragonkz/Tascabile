import * as cheerio from 'cheerio'

import type { Chapter } from '../models/Chapter'
import type {
  MangaWorldChapterJson,
  MangaWorldChapterPagesJson,
  MangaWorldMangaJson,
  MangaWorldVolumeJson,
} from '../models/WindowEntry'
import { getImageUrl } from '../utils/image'
import { absoluteUrl, extractChapterId } from '../utils/url'
import { JsonParser } from './JsonParser'

export interface MangaDetails {
  title: string
  description: string
  image: string
  genres: string[]
  chapters: Chapter[]
  authors: string[]
  artists: string[]
  status?: string
  altTitles: string[]
  fansub?: string
}

export class MangaParser {
  private readonly jsonParser = new JsonParser()

  parse(html: string): MangaDetails {
    return this.parseJson(html) ?? this.parseHtml(html)
  }

  private parseJson(html: string): MangaDetails | undefined {
    const entries = this.jsonParser.getWindowEntries(html)
    const mangaEntry = entries.find((entry) => entry.kind === 'manga')

    if (!mangaEntry) return undefined

    const mangaData = mangaEntry.data as {
      manga?: MangaWorldMangaJson
      chapters?: MangaWorldChapterJson[]
    }

    const manga = mangaData.manga
    if (!manga) return undefined

    const chapterData = entries.find((entry) => entry.kind === 'chapter')?.data as MangaWorldChapterPagesJson | undefined

    return {
      title: manga.title ?? '',
      description: manga.trama ?? '',
      image: manga.imageT ?? manga.image ?? '',
      genres: manga.genres?.map((genre) => genre.name ?? genre.slug ?? '').filter(Boolean) ?? [],
      chapters: this.parseJsonChapters(mangaData.chapters ?? [], chapterData),
      authors: manga.author ?? [],
      artists: manga.artist ?? [],
      status: manga.statusT,
      altTitles: manga.extraTitles ?? [],
      fansub: manga.fansub?.name,
    }
  }

  private parseJsonChapters(
    directChapters: MangaWorldChapterJson[],
    chapterData?: MangaWorldChapterPagesJson,
  ): Chapter[] {
    const chaptersMap = new Map<string, Chapter>()

    for (const chapter of directChapters) {
      this.addJsonChapter(chaptersMap, chapter)
    }

    const pages = chapterData?.pages

    for (const chapter of pages?.singleChapters ?? []) {
      this.addJsonChapter(chaptersMap, chapter)
    }

    for (const volume of pages?.volumes ?? []) {
      this.addVolumeChapters(chaptersMap, volume)
    }

    return [...chaptersMap.values()].sort((a, b) => a.number - b.number)
  }

  private addVolumeChapters(chaptersMap: Map<string, Chapter>, volume: MangaWorldVolumeJson): void {
    for (const chapter of volume.chapters ?? []) {
      this.addJsonChapter(chaptersMap, chapter)
    }
  }

  private addJsonChapter(chaptersMap: Map<string, Chapter>, chapter: MangaWorldChapterJson): void {
    if (!chapter.id) return

    const title = chapter.title || chapter.name || `Capitolo ${chapter.id}`
    const numberMatch = title.match(/(\d+(\.\d+)?)/) ?? chapter.name?.match(/(\d+(\.\d+)?)/)

    chaptersMap.set(chapter.id, {
      id: chapter.id,
      title,
      number: Number(numberMatch?.[1] ?? 0),
      url: '',
    })
  }

  private parseHtml(html: string): MangaDetails {
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
      authors: [],
      artists: [],
      altTitles: [],
    }
  }
}
