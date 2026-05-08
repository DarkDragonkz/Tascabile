import { strict as assert } from 'assert'
import { before, describe, it } from 'mocha'

import { BatCaveParser } from './BatCaveParser'

describe('BatCaveParser', () => {
    before(() => {
        ;(global as any).App = {
            createChapter: (chapter: any) => chapter,
            createChapterDetails: (details: any) => details,
            createHomeSection: (section: any) => ({ ...section, items: section.items ?? [] }),
            createMangaInfo: (info: any) => info,
            createPagedResults: (results: any) => results,
            createPartialSourceManga: (manga: any) => manga,
            createSourceManga: (manga: any) => manga,
            createTag: (tag: any) => tag,
            createTagSection: (section: any) => section,
        }
    })

    it('parses chapters from window.__DATA__ payload', () => {
        const parser = new BatCaveParser()
        const html = `
        <h1>Sample Series (2024)</h1>
        <script>
          window.__DATA__ = {
            "chapters": [
              {"id": 10, "title": "Sample Series #10", "posi": "10", "date": "01.01.2025"},
              {"id": 9, "title": "Sample Series #9", "posi": "9", "date": "31.12.2024"}
            ]
          };
        </script>
        `

        const chapters = parser.parseChapters(html)

        assert.equal(chapters.length, 2)
        assert.equal(chapters[0].id, '10')
        assert.equal(chapters[0].chapNum, 10)
        assert.equal(chapters[1].chapNum, 9)
    })
})
