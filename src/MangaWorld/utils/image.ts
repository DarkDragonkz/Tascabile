import type { Cheerio, Element } from 'cheerio'

import { absoluteUrl } from './url'

export function getImageUrl(image: Cheerio<Element>): string {
  const src =
    image.attr('data-src') ??
    image.attr('data-original') ??
    image.attr('data-lazy-src') ??
    image.attr('src') ??
    image.attr('content') ??
    ''

  if (src) return absoluteUrl(src)

  const srcset = image.attr('srcset') ?? image.attr('data-srcset') ?? ''
  const firstSrcsetUrl = srcset.split(',')[0]?.trim().split(' ')[0]

  return firstSrcsetUrl ? absoluteUrl(firstSrcsetUrl) : ''
}
