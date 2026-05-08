import { strict as assert } from 'assert'
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
    ReadAllComicsChapter,
    ReadAllComicsParser
} from './ReadAllComicsParser'

function loadDiagnostic(fileName: string): CheerioAPI {
    const fixturePath = join(process.cwd(), 'diagnostics', 'readallcomics', fileName)
    const html = readFileSync(fixturePath, 'utf8')

    return cheerio.load(html)
}

describe('ReadAllComicsParser', () => {
    const parser = new ReadAllComicsParser()

    it('parses category series from the real homepage diagnostic HTML', () => {
        const $ = loadDiagnostic('home.clean.html')
        const results = parser.parseSeriesList($)

        assert.equal(results.length, 20)

        const first = results[0]
        assert.equal(first.mangaId, 'grimm-fairy-tales-animated-one-shot')
        assert.equal(first.title, 'Grimm Fairy Tales: Animated One-Shot')
        assert.equal(first.publisher, 'Zenescope Entertainment')
        assert.deepEqual(first.genres, ['Action', 'Adventure', 'Fantasy'])
        assert.equal(first.year, 2013)
        assert.equal(first.issueCount, 1)
        assert.equal(first.latestChapterId, 'full-2013')
        assert.equal(first.latestChapterName, 'Full (2013)')
        assert.ok(first.image?.startsWith('https://2.bp.blogspot.com/'))
    })

    it('parses Batman category chapter links from the real diagnostic HTML', () => {
        const $ = loadDiagnostic('category-batman.clean.html')
        const chapters = parser.parseChapters($, 'batman')

        assert.ok(chapters.length > 0)
        assert.ok(chapters.some((chapter: ReadAllComicsChapter) => chapter.id === 'v4-009-2026'))
        assert.ok(chapters.every((chapter: ReadAllComicsChapter) => chapter.mangaId === 'batman'))
    })

    it('parses reader page images from the real diagnostic HTML', () => {
        const $ = loadDiagnostic('chapter-batman-v1-annual-001.clean.html')
        const details = parser.parseChapterDetails($, 'batman', 'batman-v1-annual-001')

        assert.equal(details.mangaId, 'batman')
        assert.equal(details.id, 'batman-v1-annual-001')
        assert.equal(details.pages.length, 86)
        assert.ok(details.pages[0].startsWith('https://'))
    })
})
