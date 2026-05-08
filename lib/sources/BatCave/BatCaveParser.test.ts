import { describe, expect, it } from "vitest"
import { BatcaveParser } from "../src/batcaveParser"
import { loadFixture } from "./helpers/loadFixture"

const parser = new BatcaveParser()

describe("search", () => {
  it("parses Batman page 1", () => {
    const page = parser.parseSearchPage(loadFixture("search-batman-page-1.html"))
    expect(page.query).toBe("Batman")
    expect(page.total).toBe(721)
    expect(page.rangeStart).toBe(1)
    expect(page.rangeEnd).toBe(10)
    expect(page.results).toHaveLength(10)
    expect(page.results[0]).toMatchObject({ title: "Batman (2025-)", publisher: "DC Comics", year: "2025", lastIssue: "Batman (2025-) #9", votes: 855, ratingPercent: 100 })
    expect(page.pagination).toMatchObject({ currentPage: 1, lastPage: 10, nextPageUrl: "https://batcave.biz/search/Batman/page/2/" })
  })

  it("parses Batman page 2", () => {
    const page = parser.parseSearchPage(loadFixture("search-batman-page-2.html"))
    expect(page.total).toBe(721)
    expect(page.rangeStart).toBe(11)
    expect(page.rangeEnd).toBe(20)
    expect(page.results[0]).toMatchObject({ title: "Batman: Dark Victory (1999)", publisher: "DC Comics", year: "1999", lastIssue: "Batman: Dark Victory (1999) Issue #13", votes: 251 })
    expect(page.pagination).toMatchObject({ currentPage: 2, lastPage: 10, prevPageUrl: "https://batcave.biz/search/Batman", nextPageUrl: "https://batcave.biz/search/Batman/page/3/" })
  })

  it("parses zero results", () => {
    const page = parser.parseSearchPage(loadFixture("search-not-found.html"))
    expect(page.query).toBe("asdasdasdasdasdnotfound")
    expect(page.total).toBe(0)
    expect(page.results).toHaveLength(0)
  })
})

describe("catalog", () => {
  it("parses page 1 with filters", () => {
    const page = parser.parseCatalogPage(loadFixture("catalog-page-1.html"))
    expect(page.results).toHaveLength(10)
    expect(page.results[0]).toMatchObject({ title: "The Bogie Man The Manhattan Project (1992-)", publisher: "Tundra Publishing", year: "1992", lastIssue: "The Bogie Man The Manhattan Project Full", votes: 0, ratingPercent: 0 })
    expect(page.pagination).toMatchObject({ currentPage: 1, lastPage: 3267, nextPageUrl: "https://batcave.biz/comix/page/2/" })
    expect(page.filters?.y).toMatchObject({ name: "y", title: "Year of issue", format: "range" })
  })

  it("parses page 2 without filters and excludes sidebar", () => {
    const page = parser.parseCatalogPage(loadFixture("catalog-page-2.html"))
    expect(page.results).toHaveLength(10)
    expect(page.results.map((x) => x.title)).not.toContain("Should Not Parse")
    expect(page.results[0]).toMatchObject({ title: "Jubilee: Deadly Reunion (2026-)", publisher: "Marvel Comics", year: "2026", lastIssue: "Jubilee: Deadly Reunion (2026-) #1", votes: 5, ratingPercent: 100 })
    expect(page.pagination).toMatchObject({ currentPage: 2, lastPage: 3267, prevPageUrl: "https://batcave.biz/comix/", nextPageUrl: "https://batcave.biz/comix/page/3/" })
    expect(page.filters).toBeUndefined()
  })
})

describe("reader", () => {
  it("parses window.__DATA__", () => {
    const page = parser.parseReaderPage(loadFixture("reader-ultimate-spider-man-24.html"))
    expect(page.title).toBe("Ultimate Spider-Man (2024-) #24")
    expect(page.seriesTitle).toBe("Ultimate Spider-Man (2024-)")
    expect(page.chapterId).toBe(246090)
    expect(page.newsId).toBe(32394)
    expect(page.pages).toBe(47)
    expect(page.images).toHaveLength(47)
    expect(page.prev).toBe("https://batcave.biz/reader/32394/245070#last")
    expect(page.next).toBe("https://batcave.biz/32394-ultimate-spider-man-2024.html")
  })
})
