import { strict as assert } from 'assert'
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { readFileSync } from 'fs'
import { join } from 'path'
import { BatCaveParser, BatCaveSourceComic } from './BatCaveParser'

function loadFixture(fileName: string): CheerioAPI {
    const fixturePath = join(process.cwd(), 'fixtures', 'batcave', fileName)
    const html = readFileSync(fixturePath, 'utf8')

    return cheerio.load(html)
}

describe('BatCaveParser', () => {
    const parser = new BatCaveParser()

    it('parses homepage poster items from real BatCave HTML', () => {
        const $ = loadFixture('home.html')
        const results = parser.parseHomeItems($, 'a.poster')

        assert.ok(results.length >= 10)
        assert.ok(results.some((item: BatCaveSourceComic) => item.title === 'Lobo (2026-)'))
        assert.ok(results.some((item: BatCaveSourceComic) => item.title === 'Daredevil (2026-)'))
        assert.ok(results.every((item: BatCaveSourceComic) => item.comicId.endsWith('.html')))
        assert.ok(results.every((item: BatCaveSourceComic) => item.image === undefined || item.image.startsWith('https://batcave.biz/')))
    })

    it('parses search page 1 with results and pagination data', () => {
        const $ = loadFixture('search-batman-page-1.html')
        const results = parser.parseSearchResults($)

        assert.equal(results.length, 10)
        assert.deepEqual(results[0], {
            comicId: '33758-batman-2025.html',
            title: 'Batman (2025-)',
            image: 'https://batcave.biz/uploads/mini/100x150/33758.webp',
            subtitle: 'Batman (2025-) #9'
        })
        assert.ok(results.some((item: BatCaveSourceComic) => item.title === 'Batman: The Long Halloween'))
    })

    it('parses search page 2', () => {
        const $ = loadFixture('search-batman-page-2.html')
        const results = parser.parseSearchResults($)

        assert.equal(results.length, 10)
        assert.equal(results[0].comicId, '9060-batman-dark-victory-1999.html')
        assert.equal(results[0].title, 'Batman: Dark Victory (1999)')
        assert.equal(results[0].subtitle, 'Batman: Dark Victory (1999) Issue #13')
    })

    it('returns no search results for empty result page', () => {
        const $ = loadFixture('search-not-found.html')
        const results = parser.parseSearchResults($)

        assert.equal(results.length, 0)
    })

    it('parses comic details from visible detail page data', () => {
        const $ = loadFixture('comic-detail.html')
        const details = parser.parseComicDetails($, '5629-the-boys-2006-2012.html')

        assert.equal(details.id, '5629-the-boys-2006-2012.html')
        assert.equal(details.title, 'The Boys (2006-2012)')
        assert.equal(details.publisher, 'Dynamite')
        assert.equal(details.status, 'Complete')
        assert.equal(details.year, 2006)
        assert.equal(details.image, 'https://batcave.biz/uploads/posts/poster/32/5629-the-boys-2006-2012.jpg')
        assert.ok(details.description?.startsWith('The city’s superheroes are celebrated idols'))
        assert.equal(details.chapters.length, 6)
    })

    it('parses chapter list from window data or JSON-LD fallback', () => {
        const $ = loadFixture('comic-detail.html')
        const chapters = parser.parseChapters($, '5629-the-boys-2006-2012.html')

        assert.equal(chapters.length, 6)
        assert.ok(chapters.some(chapter => chapter.id === '29427' && chapter.name === 'The Boys (2006-2012) #Omnibus Vol. 1' && chapter.chapNum === 1))
        assert.ok(chapters.some(chapter => chapter.id === '29426' && chapter.name === 'The Boys (2006-2012) #Omnibus Vol. 2' && chapter.chapNum === 2))
        assert.ok(chapters.every(chapter => chapter.comicId === '5629-the-boys-2006-2012.html'))
    })

    it('parses all reader pages from window data', () => {
        const $ = loadFixture('chapter-reader-page-1.html')
        const details = parser.parseChapterDetails($, '5629-the-boys-2006-2012.html', '29427')

        assert.equal(details.id, '29427')
        assert.equal(details.comicId, '5629-the-boys-2006-2012.html')
        assert.equal(details.pages.length, 531)
        assert.ok(details.pages[0].startsWith('https://img.batcave.biz/img/6/5629/29427/1-'))
        assert.ok(details.pages[530].startsWith('https://img.batcave.biz/img/6/5629/29427/531-'))
    })
})
