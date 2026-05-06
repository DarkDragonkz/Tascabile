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

    it('parses search results from The Boys search fixture', () => {
        const $ = loadFixture('search.html')
        const results = parser.parseSearchResults($)

        assert.ok(results.length >= 10)

        const first = results[0]

        assert.equal(first.comicId, '5629-the-boys-2006-2012.html')
        assert.equal(first.title, 'The Boys (2006-2012)')
        assert.equal(first.subtitle, 'The Boys (2006-2012) #Omnibus Vol. 6')
        assert.ok(first.image?.includes('/uploads/mini/100x150/'))
        assert.ok(results.some((result: BatCaveSourceComic) => result.title === 'The Boys: Herogasm (2009)'))
    })

    it('parses home poster items from homepage fixture', () => {
        const $ = loadFixture('home.html')
        const results = parser.parseHomeItems($)

        assert.ok(results.length > 0)
        assert.ok(results.some((result: BatCaveSourceComic) => result.title === 'Lobo (2026-)'))
        assert.ok(results.every((result: BatCaveSourceComic) => result.comicId.endsWith('.html')))
    })

    it('parses comic details and chapters from JSON-LD', () => {
        const $ = loadFixture('comic-detail.html')
        const details = parser.parseComicDetails($, '5629-the-boys-2006-2012.html')

        assert.equal(details.id, '5629-the-boys-2006-2012.html')
        assert.equal(details.title, 'The Boys (2006-2012)')
        assert.equal(details.publisher, 'Dynamite')
        assert.equal(details.status, 'Complete')
        assert.equal(details.year, 2006)
        assert.ok(details.image?.endsWith('/uploads/posts/poster/32/5629-the-boys-2006-2012.jpg'))
        assert.ok(details.description?.includes('Garth Ennis and Darick Robertson'))
        assert.equal(details.chapters.length, 6)
        assert.ok(details.chapters.some(chapter => chapter.id === '29427' && chapter.name === 'The Boys (2006-2012) #Omnibus Vol. 1'))
    })

    it('parses chapter list from detail fixture', () => {
        const $ = loadFixture('comic-detail.html')
        const chapters = parser.parseChapters($, '5629-the-boys-2006-2012.html')

        assert.equal(chapters.length, 6)
        assert.equal(chapters[0].id, '29426')
        assert.equal(chapters[0].name, 'The Boys (2006-2012) #Omnibus Vol. 2')
        assert.equal(chapters[0].chapNum, 2)
        assert.ok(chapters.some(chapter => chapter.id === '29427' && chapter.chapNum === 1))
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
