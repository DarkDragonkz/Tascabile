import type { CheerioAPI } from 'cheerio'
import { BatCave } from './BatCave/BatCave'
import { MangaWorld } from './MangaWorld/MangaWorld'

declare const cheerio: CheerioAPI

export const BatCaveSource = new BatCave(cheerio)
export const MangaWorldSource = new MangaWorld(cheerio)
