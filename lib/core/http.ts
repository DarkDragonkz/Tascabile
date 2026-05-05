/**
 * Utility condivise per configurare request Paperback.
 *
 * Questo modulo non esegue direttamente richieste HTTP: le richieste restano
 * gestite dal requestManager di Paperback. Qui centralizziamo soltanto
 * header, timeout e costruzione di request riutilizzabili.
 */

export type HttpHeaders = Record<string, string>

export interface BasicRequestOptions {
    url: string
    method?: 'GET' | 'POST'
    headers?: HttpHeaders
    body?: unknown
}

export function createDefaultHeaders(extraHeaders: HttpHeaders = {}): HttpHeaders {
    return {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        ...extraHeaders
    }
}

export function createJsonHeaders(extraHeaders: HttpHeaders = {}): HttpHeaders {
    return createDefaultHeaders({
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...extraHeaders
    })
}

export function createBasicRequest(options: BasicRequestOptions): BasicRequestOptions {
    return {
        method: options.method ?? 'GET',
        url: options.url,
        headers: options.headers ?? createDefaultHeaders(),
        body: options.body
    }
}