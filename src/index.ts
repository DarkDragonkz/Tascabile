import type { CheerioAPI } from 'cheerio'
import { MangaWorld } from './MangaWorld/MangaWorld'
import { ReadAllComics } from './ReadAllComics/ReadAllComics'

declare const cheerio: CheerioAPI

export const MangaWorldSource = new MangaWorld(cheerio)
export const ReadAllComicsSource = new ReadAllComics(cheerio)
