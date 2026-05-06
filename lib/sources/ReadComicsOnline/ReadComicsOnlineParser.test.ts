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

describe('ReadComicsOnlineParser', () => {
    const parser = new ReadComicsOnlineParser()

    it('parses search results', () => {
        const $ = loadFixture('search.html')
        const results = parser.parseSearchResults($)
        const batman = results.find((result: ReadComicsOnlineSourceComic) => result.comicId === 'Batman-Gotham-Nights-2020')

        assert.ok(results.length > 0)
        assert.ok(batman)
        assert.equal(batman?.title, 'Batman: Gotham Nights (2020)')
        assert.ok(batman?.image?.includes('/Uploads/'))
        assert.equal(batman?.subtitle, 'Completed')
    })

    it('parses homepage latest updates', () => {
        const $ = loadFixture('home.html')
        const results = parser.parseHomeLatestUpdates($)

        assert.ok(results.length > 0)
        assert.ok(results.some((result: ReadComicsOnlineSourceComic) => result.comicId === 'Batman-2025'))
        assert.ok(results.some((result: ReadComicsOnlineSourceComic) => result.subtitle?.includes('Issue')))
    })

    it('parses comic details', () => {
        const $ = loadFixture('comic-detail.html')
        const details = parser.parseComicDetails($, 'Detective-Comics-2016')

        assert.equal(details.id, 'Detective-Comics-2016')
        assert.equal(details.title, 'Detective Comics (2016)')
        assert.equal(details.status, 'Ongoing')
        assert.equal(details.publisher, 'DC Comics')
        assert.equal(details.year, 2016)
        assert.ok(details.image?.includes('/Uploads/Etc/6-22-2016/2162841detect.jpg'))
        assert.ok(details.description?.includes('unknown predator'))
        assert.ok(details.genres.includes('Action'))
        assert.ok(details.genres.includes('Adventure'))
        assert.ok(details.genres.includes('Superhero'))
        assert.ok(details.writers.includes('James Tynion IV'))
        assert.ok(details.artists.includes('Eddy Barrows'))
    })

    it('parses chapters from comic detail page', () => {
        const $ = loadFixture('comic-detail.html')
        const chapters = parser.parseChapters($, 'Detective-Comics-2016')
        const first = chapters[0]

        assert.ok(chapters.length > 0)
        assert.equal(first.id, 'Issue-1108?id=244294')
        assert.equal(first.comicId, 'Detective-Comics-2016')
        assert.equal(first.name, 'Issue #1108')
        assert.equal(first.chapNum, 1108)
        assert.equal(first.time?.getFullYear(), 2026)
        assert.equal(first.time?.getMonth(), 3)
        assert.equal(first.time?.getDate(), 22)
    })

    it('parses chapter pages from reader', () => {
        const $ = loadFixture('chapter-reader.html')
        const details = parser.parseChapterDetails($, 'Detective-Comics-2016', 'Annual-1?id=129995')

        assert.equal(details.id, 'Annual-1?id=129995')
        assert.equal(details.comicId, 'Detective-Comics-2016')
        assert.equal(details.pages.length, 5)
        assert.ok(details.pages[0].includes('RCO001'))
        assert.ok(details.pages[4].includes('RCO005'))
    })
})
