import type { CheerioAPI } from 'cheerio'
import { MangaWorld } from './MangaWorld/MangaWorld'
import { ReadComicsOnline } from './ReadComicsOnline/ReadComicsOnline'

declare const cheerio: CheerioAPI

export const MangaWorldSource = new MangaWorld(cheerio)
export const ReadComicsOnlineSource = new ReadComicsOnline(cheerio)
