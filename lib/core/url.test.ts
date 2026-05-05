import { strict as assert } from 'assert'
import { buildQueryString, buildUrl, joinUrl } from './url'

describe('core/url', () => {
    it('builds a URL without query params', () => {
        const result = buildUrl('https://example.com/', '/manga')

        assert.equal(result, 'https://example.com/manga')
    })

    it('builds a URL with query params', () => {
        const result = buildUrl('https://example.com', '/search', {
            title: 'one piece',
            page: 2,
            adult: false,
            empty: undefined
        })

        assert.equal(result, 'https://example.com/search?title=one%20piece&page=2&adult=false')
    })

    it('supports repeated query params', () => {
        const result = buildQueryString({
            'translatedLanguage[]': ['it', 'en']
        })

        assert.equal(result, 'translatedLanguage%5B%5D=it&translatedLanguage%5B%5D=en')
    })

    it('joins URL parts safely', () => {
        const result = joinUrl('https://example.com/', '/manga/', '/123')

        assert.equal(result, 'https://example.com/manga/123')
    })
})