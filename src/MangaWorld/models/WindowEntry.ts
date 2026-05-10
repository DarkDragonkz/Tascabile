export type RawEntry = [string, number, unknown, unknown]

export interface WindowEntry {
  kind: string
  key: string
  index: number
  data: Record<string, unknown>
  meta: unknown
}

export interface MangaWorldGenre {
  name?: string
  slug?: string
}

export interface MangaWorldMangaJson {
  id?: string | number
  linkId?: string | number
  slug?: string
  slugFolder?: string
  title?: string
  image?: string
  imageT?: string
  trama?: string
  statusT?: string
  author?: string[]
  artist?: string[]
  extraTitles?: string[]
  genres?: MangaWorldGenre[]
  fansub?: {
    name?: string
  }
}

export interface MangaWorldChapterJson {
  id?: string
  name?: string
  title?: string
  slugFolder?: string
  manga?: string | number
  pages?: string[]
  createdAt?: string
}

export interface MangaWorldVolumeJson {
  volume?: {
    name?: string
    imageT?: string
    slugFolder?: string
    id?: string | number
    manga?: string | number
  }
  chapters?: MangaWorldChapterJson[]
}

export interface MangaWorldChapterPagesJson {
  CDN_URL?: string
  pages?: {
    volumes?: MangaWorldVolumeJson[]
    singleChapters?: MangaWorldChapterJson[]
  }
}
