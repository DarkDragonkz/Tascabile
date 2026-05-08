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

    it('normalizes padded chapter numbers without truncating them incorrectly', () => {
        const $ = loadHtml(`
            <div class="volume-element">
                <div class="volume-name">Volume 01</div>
                <div class="chapter">
                    <a class="chap" href="/manga/1848/blue-lock/read/chapter-001/1">Capitolo 001</a>
                    <span class="date">12 maggio 2024</span>
                </div>
                <div class="chapter">
                    <a class="chap" href="/manga/1848/blue-lock/read/chapter-010/1">Capitolo 010</a>
                    <span class="date">oggi</span>
                </div>
                <div class="chapter">
                    <a class="chap" href="/manga/1848/blue-lock/read/chapter-100/1">Capitolo 100</a>
                    <span class="date">ieri</span>
                </div>
            </div>
        `)

        const chapters = parser.parseChapters($, '1848/blue-lock')

        assert.equal(chapters[0].name, 'Capitolo 01')
        assert.equal(chapters[0].chapNum, 1)
        assert.equal(chapters[0].time?.getFullYear(), 2024)
        assert.equal(chapters[0].time?.getMonth(), 4)
        assert.equal(chapters[0].time?.getDate(), 12)

        assert.equal(chapters[1].name, 'Capitolo 10')
        assert.equal(chapters[1].chapNum, 10)

        assert.equal(chapters[2].name, 'Capitolo 100')
        assert.equal(chapters[2].chapNum, 100)
    })

    it('parses chapter ids from URL variants', () => {
        const $ = loadHtml(`
            <div class="volume-element">
                <div class="volume-name">Volume 01</div>
                <div class="chapter">
                    <a class="chap" href="https://www.mangaworld.mx/manga/1848/blue-lock/read/6024a4f7561c8f438deec5fc/1?style=list">Capitolo 01</a>
                </div>
                <div class="chapter">
                    <a href="/manga/1848/blue-lock/read/chapter-002/1#reader" title="Capitolo 02"></a>
                </div>
                <div class="chapter">
                    <a href="/read/chapter-003?style=list">Capitolo 03</a>
                </div>
            </div>
        `)

        const chapters = parser.parseChapters($, '1848/blue-lock')

        assert.deepEqual(chapters.map((chapter: MangaWorldChapter) => chapter.id), [
            '6024a4f7561c8f438deec5fc',
            'chapter-002',
            'chapter-003'
        ])
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

    it('parses lazy loaded chapter pages from data attributes and srcset', () => {
        const $ = loadHtml(`
            <div id="page">
                <img class="page-image" data-src="/chapters/blue-lock/1.jpg">
                <img class="img-fluid" srcset="https://cdn.mangaworld.mx/chapters/blue-lock/2.webp 1x, https://cdn.mangaworld.mx/chapters/blue-lock/2-large.webp 2x">
                <img class="page-image" src="https://cdn.mangaworld.mx/covers/blue-lock.jpg">
                <img class="page-image" data-src="/chapters/blue-lock/1.jpg">
            </div>
        `)

        const details = parser.parseChapterDetails($, '1848/blue-lock', 'chapter-001')

        assert.deepEqual(details.pages, [
            'https://www.mangaworld.mx/chapters/blue-lock/1.jpg',
            'https://cdn.mangaworld.mx/chapters/blue-lock/2.webp'
        ])
    })

    it('prefers data-src over placeholder src for chapter pages', () => {
        const $ = loadHtml(`
            <div id="page">
                <img class="page-image" src="https://www.mangaworld.mx/public/assets/images/placeholder.png" data-src="https://cdn.mangaworld.mx/chapters/blue-lock/real-page-1.jpg">
                <img class="page-image" src="https://www.mangaworld.mx/public/assets/images/loading.gif" data-srcset="https://cdn.mangaworld.mx/reader/blue-lock/real-page-2.webp 1x, https://cdn.mangaworld.mx/reader/blue-lock/real-page-2@2x.webp 2x">
            </div>
        `)

        const details = parser.parseChapterDetails($, '1848/blue-lock', 'chapter-001')

        assert.deepEqual(details.pages, [
            'https://cdn.mangaworld.mx/chapters/blue-lock/real-page-1.jpg',
            'https://cdn.mangaworld.mx/reader/blue-lock/real-page-2.webp'
        ])
    })

    it('accepts chapter page image paths beyond the classic chapters directory', () => {
        const $ = loadHtml(`
            <div id="reader">
                <img src="https://cdn.mangaworld.mx/read/blue-lock/page-1">
                <img src="https://cdn.mangaworld.mx/reader/blue-lock/page-2.avif?token=abc">
                <img src="https://cdn.mangaworld.mx/mangas/blue-lock-cover.jpg">
                <img src="https://www.mangaworld.mx/public/assets/images/logo.png">
            </div>
        `)

        const details = parser.parseChapterDetails($, '1848/blue-lock', 'chapter-001')

        assert.deepEqual(details.pages, [
            'https://cdn.mangaworld.mx/read/blue-lock/page-1',
            'https://cdn.mangaworld.mx/reader/blue-lock/page-2.avif?token=abc'
        ])
    })

    it('prefers data-src over placeholder src for search result covers', () => {
        const $ = loadHtml(`
            <div class="comics-grid">
                <div class="entry">
                    <a class="manga-title" href="https://www.mangaworld.mx/manga/1848/blue-lock/" title="Blue Lock">Blue Lock</a>
                    <img src="https://www.mangaworld.mx/public/assets/images/placeholder.png" data-src="https://cdn.mangaworld.mx/mangas/blue-lock.jpg" alt="Blue Lock">
                </div>
            </div>
        `)

        const results = parser.parseSearchResults($)

        assert.equal(results[0].image, 'https://cdn.mangaworld.mx/mangas/blue-lock.jpg')
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

    it('returns an empty list when a homepage section has no matching items', () => {
        const $ = loadHtml('<main><h3>Nessun elemento</h3></main>')
        const results = parser.parseHomeSectionItems($, '#chapters-slide .entry.vertical')

        assert.deepEqual(results, [])
    })

    it('parses entry subtitles consistently', () => {
        const $ = loadHtml(`
            <div class="comics-grid">
                <div class="entry">
                    <a class="manga-title" href="https://www.mangaworld.mx/manga/1848/blue-lock/" title="Blue Lock">Blue Lock</a>
                    <a class="xanh">Capitolo 341</a>
                </div>
                <div class="entry">
                    <a class="manga-title" href="https://www.mangaworld.mx/manga/1708/one-piece/" title="One Piece">One Piece</a>
                    <span class="genre">Tipo: Manga</span>
                    <span class="status">Stato: In corso</span>
                </div>
            </div>
        `)

        const results = parser.parseSearchResults($)

        assert.equal(results[0].subtitle, 'Ultimo: Capitolo 341')
        assert.equal(results[1].subtitle, 'Manga • In corso')
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
