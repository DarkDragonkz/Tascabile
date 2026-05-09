import type {
  MangaWorldChapterPagesJson,
  RawEntry,
  WindowEntry,
} from '../models/WindowEntry'

export class JsonParser {
  getWindowEntries(html: string): WindowEntry[] {
    const regex = /\$MC\s*=\s*\(window\.\$MC\|\|\[\]\)\.concat\(([\s\S]*?)\)<\/script>/i
    const match = html.match(regex)

    if (!match?.[1]) {
      return []
    }

    try {
      const json = JSON.parse(match[1].trim()) as {
        o?: {
          w?: RawEntry[]
        }
      }

      return (json.o?.w ?? []).map((entry) => {
        const [key, index, data, meta] = entry

        return {
          kind: this.detectKind(data),
          key,
          index,
          data: typeof data === 'object' && data ? (data as Record<string, unknown>) : {},
          meta,
        }
      })
    } catch {
      return []
    }
  }

  private detectKind(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return 'unknown'
    }

    if ('mangas' in data) {
      return 'search'
    }

    if ('manga' in data) {
      return 'manga'
    }

    if ('CDN_URL' in data) {
      return 'chapter'
    }

    if ('mostViewedChapters' in data) {
      return 'trending'
    }

    if ('globalData' in data) {
      return 'global'
    }

    return 'config'
  }

  getChapterPagesData(entries: WindowEntry[]): MangaWorldChapterPagesJson | undefined {
    return entries.find((entry) => entry.kind === 'chapter')?.data as MangaWorldChapterPagesJson | undefined
  }
}
