import { strict as assert } from 'assert'
import { createBasicRequest, createDefaultHeaders, createJsonHeaders } from './http'

describe('core/http', () => {
    it('creates default browser-like headers', () => {
        const headers = createDefaultHeaders()

        assert.equal(headers['User-Agent'], 'Mozilla/5.0')
        assert.ok(headers['Accept'].includes('text/html'))
    })

    it('allows overriding default headers', () => {
        const headers = createDefaultHeaders({
            'User-Agent': 'CustomAgent',
            'Referer': 'https://example.com'
        })

        assert.equal(headers['User-Agent'], 'CustomAgent')
        assert.equal(headers['Referer'], 'https://example.com')
    })

    it('creates JSON headers', () => {
        const headers = createJsonHeaders()

        assert.equal(headers['Accept'], 'application/json')
        assert.equal(headers['Content-Type'], 'application/json')
    })

    it('creates a basic GET request by default', () => {
        const request = createBasicRequest({
            url: 'https://example.com/api'
        })

        assert.equal(request.method, 'GET')
        assert.equal(request.url, 'https://example.com/api')
        assert.equal(request.headers?.['User-Agent'], 'Mozilla/5.0')
    })
})