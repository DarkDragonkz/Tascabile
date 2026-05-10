import { absoluteUrl } from './url'

interface ImageAttributes {
  attr(name: string): string | undefined
}

export function getImageUrl(image: ImageAttributes): string {
  const srcset = image.attr('srcset') ?? image.attr('data-srcset') ?? ''
  const firstSrcsetUrl = srcset.split(',')[0]?.trim().split(' ')[0]

  const src =
    image.attr('data-src') ??
    image.attr('data-original') ??
    image.attr('data-lazy-src') ??
    image.attr('data-cfsrc') ??
    image.attr('src') ??
    image.attr('content') ??
    firstSrcsetUrl ??
    ''

  return src ? absoluteUrl(src) : ''
}
