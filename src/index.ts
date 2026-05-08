import type { CheerioAPI } from 'cheerio'
import { MangaWorld } from './MangaWorld/MangaWorld'

declare const cheerio: CheerioAPI

export const MangaWorldSource = new MangaWorld(cheerio)
