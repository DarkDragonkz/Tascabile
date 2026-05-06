import { strict as assert } from 'assert'
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ReadComicsOnlineParser, ReadComicsOnlineSourceComic } from './ReadComicsOnlineParser'

function loadFixture(fileName: string): CheerioAPI {
    const fixturePath = join(process.cwd(), 'fixtures', 'readcomicsonline', fileName)
    const html = readFileSync(fixturePath, 'utf8')

    return cheerio.load(html)
}

function loadFixtureHtml(fileName: string): string {
    const fixturePath = join(process.cwd(), 'fixtures', 'readcomicsonline', fileName)

    return readFileSync(fixturePath, 'utf8')
}

describe('ReadComicsOnlineParser', () => {
    const parser = new ReadComicsOnlineParser()

    it('parses search results', () => {
        const $ = loadFixture('search.html')
        const results = parser.parseSearchResults($)
        const first = results[0]

        assert.ok(results.length > 0)
        assert.ok(first)
        assert.ok(first.comicId.length > 0)
        assert.ok(first.title.length > 0)
        assert.ok(first.image?.includes('/Uploads/'))
    })

    it('parses homepage latest updates', () => {
        const $ = loadFixture('home.html')
        const results = parser.parseHomeLatestUpdates($)

        assert.ok(Array.isArray(results))
    })

    it('parses comic details', () => {
        const $ = loadFixture('comic-detail.html')
        const details = parser.parseComicDetails($, 'Detective-Comics-2016')

        assert.equal(details.id, 'Detective-Comics-2016')
        assert.ok(details.title.length > 0)
        assert.ok(details.status)
        assert.ok(Array.isArray(details.genres))
        assert.ok(Array.isArray(details.writers))
        assert.ok(Array.isArray(details.artists))
    })

    it('parses chapters from comic detail page', () => {
        const $ = loadFixture('comic-detail.html')
        const chapters = parser.parseChapters($, 'Detective-Comics-2016')

        assert.ok(Array.isArray(chapters))

        if (chapters.length > 0) {
            const first = chapters[0]

            assert.ok(first.id.length > 0)
            assert.equal(first.comicId, 'Detective-Comics-2016')
            assert.ok(first.name.length > 0)
        }
    })

    it('returns safe chapter details from reader fixture', () => {
        const html = loadFixtureHtml('chapter-reader.html')
        const details = parser.parseChapterDetails(html, 'Detective-Comics-2016', 'Annual-1?id=129995')

        assert.equal(details.id, 'Annual-1?id=129995')
        assert.equal(details.mangaId, 'Detective-Comics-2016')
        assert.ok(Array.isArray(details.pages))
    })
})
