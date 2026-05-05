/**
 * Utility condivise per costruire URL e query string.
 *
 * Nel progetto originale molte source costruiscono URL manualmente.
 * Questo helper centralizza la logica per evitare duplicazioni e bug.
 */

export type QueryParamValue = string | number | boolean | null | undefined

export type QueryParams = Record<string, QueryParamValue | QueryParamValue[]>

export function buildUrl(baseUrl: string, path: string, params?: QueryParams): string {
    const normalizedBase = baseUrl.replace(/\/+$/, '')
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    const query = params ? buildQueryString(params) : ''

    return query.length > 0
        ? `${normalizedBase}${normalizedPath}?${query}`
        : `${normalizedBase}${normalizedPath}`
}

export function buildQueryString(params: QueryParams): string {
    const searchParams: string[] = []

    for (const [key, rawValue] of Object.entries(params)) {
        const values = Array.isArray(rawValue) ? rawValue : [rawValue]

        for (const value of values) {
            if (value === null || value === undefined) {
                continue
            }

            searchParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        }
    }

    return searchParams.join('&')
}

export function joinUrl(...parts: string[]): string {
    return parts
        .filter(part => part.length > 0)
        .map((part, index) => {
            if (index === 0) {
                return part.replace(/\/+$/, '')
            }

            return part.replace(/^\/+|\/+$/g, '')
        })
        .join('/')
}