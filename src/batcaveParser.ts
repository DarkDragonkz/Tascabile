import type { CheerioAPI, Cheerio } from "cheerio"
import type { AnyNode } from "domhandler"

const DEFAULT_BASE_URL = "https://batcave.biz"

type NodeSelection = Cheerio<AnyNode>

export interface BatcavePagination {
  currentPage: number
  lastPage?: number
  nextPageUrl?: string
  prevPageUrl?: string
}

export interface BatcaveListItem {
  title: string
  url: string
  image?: string
  publisher?: string
  year?: string
  description?: string
  lastIssue?: string
  ratingPercent?: number
  votes?: number
  readUrl?: string
}

export interface BatcaveSearchPage {
  query?: string
  total: number
  rangeStart?: number
  rangeEnd?: number
  results: BatcaveListItem[]
  pagination: BatcavePagination
}

export interface BatcaveCatalogFilterValue {
  id?: number
  value: string
  selected?: boolean
}

export interface BatcaveCatalogFilterRange {
  min: number
  max: number
  from?: number
  to?: number
}

export interface BatcaveCatalogFilter {
  name: string
  title: string
  format: "list" | "range" | string
  values: BatcaveCatalogFilterValue[] | BatcaveCatalogFilterRange
}

export interface BatcaveCatalogPage {
  results: BatcaveListItem[]
  pagination: BatcavePagination
  filters?: Record<string, BatcaveCatalogFilter>
}

export interface BatcaveChapterRef {
  id: number
  title: string
  title_en?: string
}

export interface BatcaveReaderPage {
  title: string
  seriesTitle?: string
  chapterId: number
  newsId: number
  pages: number
  images: string[]
  chapters: BatcaveChapterRef[]
  prev?: string
  next?: string
  bookmark?: number
  readed?: boolean
}

export class BatcaveParser {
  constructor(private readonly baseUrl = DEFAULT_BASE_URL) {}

  parseSearchPage($: CheerioAPI): BatcaveSearchPage {
    const message = $("#dle-content .message-info").first().text().trim()
    const range = this.parseRangeFromMessage(message)

    return {
      query: $("#searchinput").attr("value")?.trim() || undefined,
      total: this.parseTotalFromMessage(message),
      rangeStart: range?.start,
      rangeEnd: range?.end,
      results: this.parseListItems($),
      pagination: this.parsePagination($),
    }
  }

  parseCatalogPage($: CheerioAPI): BatcaveCatalogPage {
    return {
      results: this.parseListItems($),
      pagination: this.parsePagination($),
      filters: this.parseCatalogFilters($),
    }
  }

  parseReaderPage($: CheerioAPI): BatcaveReaderPage {
    const raw = this.extractWindowJson($, "__DATA__")
    if (!raw || typeof raw !== "object") throw new Error("Reader data not found: missing window.__DATA__")

    const data = raw as Record<string, unknown>
    const title = this.text($('title')).replace(/^Read\s+/i, "").replace(/\s+comics online.*$/i, "")

    return {
      title,
      seriesTitle: this.text($(".header__post-title")) || undefined,
      chapterId: Number(data.chapter_id),
      newsId: Number(data.news_id),
      pages: Number(data.pages),
      images: Array.isArray(data.images) ? data.images.map((src) => this.absoluteUrl(String(src))) : [],
      chapters: Array.isArray(data.chapters)
        ? data.chapters.map((ch) => {
            const item = ch as Record<string, unknown>
            return {
              id: Number(item.id),
              title: String(item.title ?? ""),
              title_en: item.title_en ? String(item.title_en) : undefined,
            }
          })
        : [],
      prev: typeof data.prev === "string" && data.prev ? this.absoluteUrl(data.prev) : undefined,
      next: typeof data.next === "string" && data.next ? this.absoluteUrl(data.next) : undefined,
      bookmark: typeof data.bookmark === "number" ? data.bookmark : undefined,
      readed: typeof data.readed === "boolean" ? data.readed : undefined,
    }
  }

  parseCatalogFilters($: CheerioAPI): Record<string, BatcaveCatalogFilter> | undefined {
    const raw = this.extractWindowJson($, "__XFILTER__")
    if (!raw || typeof raw !== "object") return undefined

    const filterItems = (raw as Record<string, unknown>).filter_items
    if (!filterItems || typeof filterItems !== "object") return undefined

    return filterItems as Record<string, BatcaveCatalogFilter>
  }

  parsePagination($: CheerioAPI): BatcavePagination {
    const pagination = $("#dle-content .pagination").first()
    const currentText = pagination.find(".pagination__pages > span").first().text().trim()
    const currentPage = Number(currentText || "1")

    const pageLinks = pagination
      .find("a")
      .toArray()
      .map((el) => {
        const page = Number($(el).text().trim())
        const href = $(el).attr("href")
        return { page, href: href ? this.absoluteUrl(href) : undefined }
      })
      .filter((x): x is { page: number; href: string } => Number.isFinite(x.page) && Boolean(x.href))

    const lastPage = pageLinks.length ? Math.max(currentPage, ...pageLinks.map((x) => x.page)) : currentPage

    return {
      currentPage,
      lastPage,
      nextPageUrl: pageLinks.find((x) => x.page === currentPage + 1)?.href,
      prevPageUrl: pageLinks.find((x) => x.page === currentPage - 1)?.href,
    }
  }

  parseListItems($: CheerioAPI): BatcaveListItem[] {
    return $("#dle-content > .readed.short")
      .toArray()
      .map((el) => {
        const root = $(el)
        const titleAnchor = root.find(".readed__title a[href]").first()
        const title = this.text(titleAnchor)
        const href = titleAnchor.attr("href")
        if (!title || !href) return undefined

        const meta = root.find(".readed__meta-item").toArray().map((x) => this.text($(x)))
        const infoLis = root.find(".readed__info li").toArray().map((x) => this.text($(x)))
        const imageRaw = root.find(".readed__img img").attr("data-src") || root.find(".readed__img img").attr("src") || undefined
        const lastIssueRaw = infoLis.find((x) => /^Last issue:/i.test(x))

        return {
          title,
          url: this.absoluteUrl(href),
          image: imageRaw && !imageRaw.startsWith("data:") ? this.absoluteUrl(imageRaw) : undefined,
          publisher: meta[0] || undefined,
          year: meta[1] || undefined,
          description: infoLis.find((x) => !/^Last issue:/i.test(x)) || undefined,
          lastIssue: lastIssueRaw?.replace(/^Last issue:\s*/i, "").trim(),
          ratingPercent: this.parseRatingPercent(root.find(".current-rating").first().attr("style")),
          votes: this.parseInteger(root.find(".readed__rating-votes span").first().text()),
          readUrl: this.attrAbsolute(root.find(".readed__btn[href]").first(), "href"),
        } satisfies BatcaveListItem
      })
      .filter((x): x is BatcaveListItem => Boolean(x))
  }

  private parseTotalFromMessage(message: string): number {
    const match = message.match(/found\s+([\d,.\s]+)\s+answers?/i)
    return match ? this.parseInteger(match[1]) ?? 0 : 0
  }

  private parseRangeFromMessage(message: string): { start: number; end: number } | undefined {
    const match = message.match(/Query results\s+(\d+)\s*-\s*(\d+)/i)
    if (!match) return undefined
    return { start: Number(match[1]), end: Number(match[2]) }
  }

  private parseRatingPercent(style?: string): number | undefined {
    const match = style?.match(/width\s*:\s*(\d+(?:\.\d+)?)%/i)
    return match ? Number(match[1]) : undefined
  }

  private parseInteger(value?: string): number | undefined {
    const normalized = value?.replace(/[^\d-]/g, "")
    if (!normalized) return undefined
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  private attrAbsolute(node: NodeSelection, attr: string): string | undefined {
    const value = node.attr(attr)
    return value ? this.absoluteUrl(value) : undefined
  }

  private absoluteUrl(value: string): string {
    return new URL(value, this.baseUrl).href
  }

  private text(node: NodeSelection): string {
    return node.text().replace(/\s+/g, " ").trim()
  }

  private extractWindowJson($: CheerioAPI, key: string): unknown | undefined {
    const scripts = $("script").toArray().map((el) => $(el).html() ?? "")

    for (const script of scripts) {
      const idx = script.indexOf(`window.${key}`)
      if (idx < 0) continue

      const eq = script.indexOf("=", idx)
      if (eq < 0) continue

      const jsonText = this.readBalancedJson(script.slice(eq + 1).trim())
      if (jsonText) return JSON.parse(jsonText)
    }

    return undefined
  }

  private readBalancedJson(input: string): string | undefined {
    const start = input.search(/[{\[]/)
    if (start < 0) return undefined

    const opener = input[start]
    const closer = opener === "{" ? "}" : "]"
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < input.length; i++) {
      const ch = input[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === "\\") escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === opener) depth++
      if (ch === closer) depth--
      if (depth === 0) return input.slice(start, i + 1)
    }

    return undefined
  }
}
