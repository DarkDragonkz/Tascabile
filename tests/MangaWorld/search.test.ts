import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SearchParser } from '../../src/MangaWorld/parsers/SearchParser'

describe('MangaWorld SearchParser', () => {
  it('parses search fixture', () => {
    const html = readFileSync(
      resolve('fixtures/mangaworld/search.html'),
      'utf8'
    )

    const parser = new SearchParser()
    const mangas = parser.parse(html)

    expect(mangas.length).toBeGreaterThan(0)
  })
})
