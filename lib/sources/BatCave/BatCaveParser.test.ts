import { strict as assert } from 'assert'
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { readFileSync } from 'fs'
import { join } from 'path'
import { BatCaveHomeItem, BatCaveParser } from './BatCaveParser'

function loadFixture(fileName: string): CheerioAPI {
    const fixturePath = join(process.cwd(), 'fixtures', 'batcave', fileName)
    const html = readFileSync(fixturePath, 'utf8')

    return cheerio.load(html)
}

describe('BatCaveParser homepage', () => {
    const parser = new BatCaveParser()

    it('parses featured carousel posters from homepage fixture', () => {
        const $ = loadFixture('home.html')
        const items = parser.parseFeaturedHomeItems($)

        assert.ok(items.length >= 10)
        assert.deepEqual(items[0], {
            comicId: '34141-lobo-2026.html',
            title: 'Lobo (2026-)',
            image: 'https://batcave.biz/uploads/mini/142x212/9b/6225819f07865b76adbbfbedbd9727.jpg',
            subtitle: 'DC Comics • 2026'
        })
        assert.ok(items.some((item: BatCaveHomeItem) => item.comicId === '34170-daredevil-2026.html' && item.title === 'Daredevil (2026-)'))
        assert.ok(items.every((item: BatCaveHomeItem) => item.comicId.endsWith('.html')))
        assert.ok(items.every((item: BatCaveHomeItem) => item.image === undefined || item.image.startsWith('https://batcave.biz/')))
    })
})
