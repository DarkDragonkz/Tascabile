import { strict as assert } from 'assert'
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
    BatCaveChapter,
    BatCaveParser,
    BatCaveSourceComic
} from './BatCaveParser'

function loadFixture(fileName: string): CheerioAPI {
    const fixturePath = join(process.cwd(), 'fixtures', 'batcave', fileName)
    const html = readFileSync(fixturePath, 'utf8')

    return cheerio.load(html)
}

function loadHtml(html: string): CheerioAPI {
    return cheerio.load(html)
}

describe('BatCaveParser', () => {
    const parser = new BatCaveParser()

    it('parses homepage poster items', () => {
        const $ = loadFixture('home.html')
        const results = parser.parseHomeSectionItems($, '.sect--popular')

        assert.ok(results.length > 0)
        assert.ok(results.some((result: BatCaveSourceComic) => result.title.includes('Batman')))
        assert.ok(results.every((result: BatCaveSourceComic) => result.comicId.length > 0))
        assert.ok(results.every((result: BatCaveSourceComic) => !result.comicId.endsWith('.html')))
    })

    it('parses homepage section items by heading', () => {
        const $ = loadFixture('home.html')
        const results = parser.parseHomeSectionItemsByHeading($, ['Hot new releases in comics'])

        assert.ok(results.length > 0)
        assert.ok(results.some((result: BatCaveSourceComic) => result.title.length > 0))
    })

    it('parses search results', () => {
        const $ = loadFixture('search-batman.html')
        const results = parser.parseSearchResults($)

        assert.ok(results.length > 0)

        const batman2025 = results.find((result: BatCaveSourceComic) => result.comicId === '33758-batman-2025')

        assert.ok(batman2025)
        assert.equal(batman2025?.title, 'Batman (2025-)')
        assert.ok(batman2025?.image?.includes('/uploads/mini/100x150/'))
        assert.ok(batman2025?.subtitle?.includes('DC Comics'))
        assert.ok(batman2025?.subtitle?.includes('Last: Batman (2025-) #9'))
    })

    it('extracts comic ids from BatCave URLs', () => {
        assert.equal(
            parser.extractComicId('https://batcave.biz/6975-invincible-2003.html'),
            '6975-invincible-2003'
        )
        assert.equal(
            parser.extractComicId('/33758-batman-2025.html'),
            '33758-batman-2025'
        )
        assert.equal(parser.extractComicId('/reader/6975/237877'), undefined)
    })

    it('parses comic details from JSON-LD and page markup', () => {
        const $ = loadFixture('comic-detail.html')
        const details = parser.parseComicDetails($, '6975-invincible-2003')

        assert.equal(details.id, '6975-invincible-2003')
        assert.equal(details.title, 'Invincible (2003)')
        assert.equal(details.publisher, 'Image Comics')
        assert.equal(details.status, 'Completed')
        assert.equal(details.year, 2003)
        assert.ok(details.image?.includes('/uploads/posts/poster/69/6975-invincible-2003.jpg'))
        assert.ok(details.description?.includes('Mark Grayson'))
        assert.ok(details.genres.includes('Action'))
        assert.ok(details.genres.includes('Superhero'))
        assert.ok(details.authors.includes('Robert Kirkman'))
        assert.ok(details.artists.includes('Cory Walker'))
    })

    it('parses chapters from comic detail JSON-LD', () => {
        const $ = loadFixture('comic-detail.html')
        const chapters = parser.parseChapters($, '6975-invincible-2003')

        assert.ok(chapters.length > 0)

        const latestChapter = chapters.find((chapter: BatCaveChapter) => chapter.id === '238046')
        const olderChapter = chapters.find((chapter: BatCaveChapter) => chapter.id === '238027')

        assert.ok(latestChapter)
        assert.equal(latestChapter?.name, 'Invincible (2003) Issue #144')
        assert.equal(latestChapter?.chapNum, 144)

        assert.ok(olderChapter)
        assert.equal(olderChapter?.chapNum, 125)
    })

    it('parses reader chapters from embedded data', () => {
        const $ = loadFixture('issue-reader.html')
        const chapters = parser.parseReaderChapters($, '6975-invincible-2003')

        assert.ok(chapters.length > 100)
        assert.equal(chapters[0].id, '238046')
        assert.equal(chapters[0].name, 'Invincible (2003) Issue #144')
        assert.equal(chapters[0].chapNum, 144)
    })

    it('parses reader pages from embedded data or SSR shell', () => {
        const $ = loadFixture('issue-reader.html')
        const details = parser.parseChapterDetails($, '6975-invincible-2003', '237877')

        assert.equal(details.id, '237877')
        assert.equal(details.comicId, '6975-invincible-2003')
        assert.ok(details.pages.length > 0)
        assert.ok(details.pages[0].startsWith('https://img.batcave.biz/img/7/6975/237877/'))
    })

    it('parses tags from genre links', () => {
        const $ = loadHtml(`
            <div class="page__tags d-flex">
                <a href="https://batcave.biz/genres/Action/">action</a>,
                <a href="https://batcave.biz/genres/Sci-Fi/">sci-fi</a>,
                <a href="https://batcave.biz/genres/Superhero/">superhero</a>
            </div>
        `)

        const tags = parser.parseTags($)

        assert.deepEqual(tags, [
            { id: 'Action', label: 'Action' },
            { id: 'Sci-Fi', label: 'Sci-Fi' },
            { id: 'Superhero', label: 'Superhero' }
        ])
    })
})
