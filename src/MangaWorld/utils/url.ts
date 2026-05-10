import { MANGA_WORLD_DOMAIN } from '../constants/MangaWorld'

export function absoluteUrl(url: string): string {
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return `${MANGA_WORLD_DOMAIN}${url}`
  return `${MANGA_WORLD_DOMAIN}/${url}`
}

export function extractMangaId(url: string): string {
  const match = url.match(/\/manga\/([^/]+\/[^/]+)/)
  return match?.[1] ?? url
}

export function extractChapterId(url: string): string {
  const match = url.match(/\/read\/([^/?#]+)/)
  return match?.[1] ?? url
}
