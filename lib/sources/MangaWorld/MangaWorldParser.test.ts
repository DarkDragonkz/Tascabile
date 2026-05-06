import { strict as assert } from 'assert'
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
    MangaWorldChapter,
    MangaWorldParser,
    MangaWorldSourceManga,
    MangaWorldTag
} from './MangaWorldParser'

function loadFixture(fileName: string): CheerioAPI {
    const fixturePath = join(process.cwd(), 'fixtures', 'mangaworld', fileName)
    const html = readFileSync(fixturePath, 'utf8')

    return cheerio.load(html)
}

function loadHtml(html: string): CheerioAPI {
    return cheerio.load(html)
}

describe('MangaWorldParser', () => {
    const parser = new MangaWorldParser()

    it('parses manga details from the detail page', () => {
        const $ = loadFixture('manga-detail.html')
        const details = parser.parseMangaDetails($, '1848/blue-lock')

        assert.equal(details.id, '1848/blue-lock')
        assert.equal(details.title, 'Blue Lock')
        assert.equal(details.type, 'Manga')
        assert.equal(details.status, 'In corso')
        assert.equal(details.year, 2018)
        assert.ok(details.image?.includes('cdn.mangaworld.mx'))
        assert.ok(details.description?.includes('Mondiali di calcio'))
        assert.ok(details.genres.includes('Azione'))
        assert.ok(details.genres.includes('Sport'))
        assert.ok(details.authors.includes('KANESHIRO Muneyuki'))
        assert.ok(details.artists.includes('NOMURA Yusuke'))
    })

    it('parses chapters from the detail page with chapter and volume information', () => {
        const $ = loadFixture('manga-detail.html')
        const chapters = parser.parseChapters($, '1848/blue-lock')

        assert.ok(chapters.length > 0)

        const firstChapter = chapters.find((chapter: MangaWorldChapter) => chapter.id === '6024a4f7561c8f438deec5fc')
        const latestChapter = chapters.find((chapter: MangaWorldChapter) => chapter.id === '69fa4cfe01f7a03ac10d8ed4')

        assert.ok(firstChapter)
        assert.equal(firstChapter?.name, 'Capitolo 01')
        assert.equal(firstChapter?.chapNum, 1)
        assert.equal(firstChapter?.volume, 1)
        assert.equal(firstChapter?.volumeName, 'Volume 01')

        assert.ok(latestChapter)
        assert.equal(latestChapter?.chapNum, 341)
        assert.equal(latestChapter?.volume, 39)
        assert.equal(latestChapter?.volumeName, 'Volume 39')
    })

    it('parses all chapter pages from list reader fixture', () => {
        const $ = loadFixture('chapter-list.html')
        const details = parser.parseChapterDetails(
            $,
            '1848/blue-lock',
            '6024a4f7561c8f438deec5fc'
        )

        assert.equal(details.id, '6024a4f7561c8f438deec5fc')
        assert.equal(details.mangaId, '1848/blue-lock')
        assert.equal(details.pages.length, 76)
        assert.ok(details.pages[0].endsWith('/1.png'))
        assert.ok(details.pages[75].endsWith('/76.png'))
    })

    it('parses search results from archive search fixture', () => {
        const $ = loadFixture('search.html')
        const results = parser.parseSearchResults($)

        assert.ok(results.length > 0)
        assert.ok(results.some((result: MangaWorldSourceManga) => result.title === 'One Piece'))
        assert.ok(results.some((result: MangaWorldSourceManga) => result.mangaId === '1708/one-piece'))
    })

    it('parses tags from archive/search fixture', () => {
        const $ = loadFixture('search.html')
        const tags = parser.parseTags($)

        assert.ok(tags.length > 0)
        assert.ok(tags.some((tag: MangaWorldTag) => tag.id === 'azione' && tag.label === 'Azione'))
        assert.ok(tags.some((tag: MangaWorldTag) => tag.id === 'shounen' && tag.label === 'Shounen'))
    })

    it('parses trending items from the homepage fixture', () => {
        const $ = loadFixture('home.html')
        const results = parser.parseHomeSectionItems($, '#chapters-slide .entry.vertical')

        assert.ok(results.length > 0)
        assert.ok(results.some((result: MangaWorldSourceManga) => result.title.length > 0))
        assert.ok(results.every((result: MangaWorldSourceManga) => result.mangaId.includes('/')))
    })

    it('parses monthly section items by heading', () => {
        const $ = loadHtml(`
            <section>
                <div class="s-title">
                    <i class="fas fa-star"></i>
                    <h3>Manga del mese</h3>
                </div>
                <div class="comics-grid">
                    <div class="entry">
                        <a class="thumb position-relative" href="https://www.mangaworld.mx/manga/1848/blue-lock/" title="Blue Lock">
                            <img src="https://cdn.mangaworld.mx/mangas/blue-lock.jpg" alt="Blue Lock">
                        </a>
                        <div class="content">
                            <p class="name m-0">
                                <a class="manga-title" href="https://www.mangaworld.mx/manga/1848/blue-lock/" title="Blue Lock">Blue Lock</a>
                            </p>
                        </div>
                    </div>
                    <div class="entry">
                        <a class="thumb position-relative" href="https://www.mangaworld.mx/manga/1708/one-piece/" title="One Piece">
                            <img src="https://cdn.mangaworld.mx/mangas/one-piece.jpg" alt="One Piece">
                        </a>
                        <div class="content">
                            <p class="name m-0">
                                <a class="manga-title" href="https://www.mangaworld.mx/manga/1708/one-piece/" title="One Piece">One Piece</a>
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        `)

        const results = parser.parseHomeSectionItemsByHeading($, ['Manga del mese'])

        assert.equal(results.length, 2)
        assert.equal(results[0].mangaId, '1848/blue-lock')
        assert.equal(results[0].title, 'Blue Lock')
        assert.equal(results[1].mangaId, '1708/one-piece')
        assert.equal(results[1].title, 'One Piece')
    })
})
