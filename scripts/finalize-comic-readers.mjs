import { copyFile, readFile, writeFile } from "node:fs/promises";

async function patchExact(path, label, target, replacement) {
  const source = await readFile(path, "utf8");
  if (!source.includes(target)) {
    throw new Error(`${label} changed; review generated source before building.`);
  }
  await writeFile(path, source.replace(target, replacement));
}

async function patchRegex(path, label, pattern, replacement) {
  const source = await readFile(path, "utf8");
  if (!pattern.test(source)) {
    throw new Error(`${label} changed; review generated source before building.`);
  }
  await writeFile(path, source.replace(pattern, replacement));
}

const BATCAVE_FORMS = `import {
  AdvancedSearchForm,
  InputRow,
  Section,
  SelectRow,
  type JSONObject,
} from "@paperback/types";

export interface BatCaveSearchMeta extends JSONObject {
  sort: string[];
  direction: string[];
  yearFrom: string;
  yearTo: string;
}

const SORT_OPTIONS = [
  { id: "", title: "Default" },
  { id: "editdate", title: "Last updated" },
  { id: "date", title: "Publication date" },
  { id: "rating", title: "Rating" },
  { id: "news_read", title: "Most read" },
  { id: "comm_num", title: "Most commented" },
  { id: "title", title: "Title" },
];

const DIRECTION_OPTIONS = [
  { id: "desc", title: "Descending" },
  { id: "asc", title: "Ascending" },
];

export class BatCaveSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private direction: string[];
  private yearFrom: string;
  private yearTo: string;

  constructor(initialMeta?: BatCaveSearchMeta) {
    super();
    this.sort = initialMeta?.sort ?? [];
    this.direction = initialMeta?.direction ?? ["desc"];
    this.yearFrom = initialMeta?.yearFrom ?? "";
    this.yearTo = initialMeta?.yearTo ?? "";
  }

  async updateSort(value: string[]): Promise<void> {
    this.sort = value;
    this.reloadForm();
  }

  async updateDirection(value: string[]): Promise<void> {
    this.direction = value;
    this.reloadForm();
  }

  async updateYearFrom(value: string): Promise<void> {
    this.yearFrom = value;
    this.reloadForm();
  }

  async updateYearTo(value: string): Promise<void> {
    this.yearTo = value;
    this.reloadForm();
  }

  getSearchQueryMetadata(): JSONObject {
    return {
      searchMeta: {
        sort: this.sort,
        direction: this.direction,
        yearFrom: this.yearFrom,
        yearTo: this.yearTo,
      } satisfies BatCaveSearchMeta,
    };
  }

  override getSections() {
    return [
      Section(
        {
          id: "batcave_order",
          footer: "Browse BatCave's large comics archive without entering a title.",
        },
        [
          SelectRow("sort", {
            title: "Sort by",
            value: this.sort,
            options: SORT_OPTIONS,
            minItemCount: 0,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as BatCaveSearchForm, "updateSort"),
          }),
          SelectRow("direction", {
            title: "Direction",
            value: this.direction,
            options: DIRECTION_OPTIONS,
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as BatCaveSearchForm, "updateDirection"),
          }),
        ],
      ),
      Section(
        {
          id: "batcave_year",
          footer: "Limit archive browsing to a publication-year range.",
        },
        [
          InputRow("year_from", {
            title: "Year from",
            value: this.yearFrom,
            onValueChange: Application.Selector(this as BatCaveSearchForm, "updateYearFrom"),
          }),
          InputRow("year_to", {
            title: "Year to",
            value: this.yearTo,
            onValueChange: Application.Selector(this as BatCaveSearchForm, "updateYearTo"),
          }),
        ],
      ),
    ];
  }
}
`;

const BATCAVE_SETTINGS = `import { ButtonRow, Form, LabelRow, Section, ToggleRow } from "@paperback/types";

const LATEST_KEY = "batcave.ui.latest";
const TOP_RATED_KEY = "batcave.ui.topRated";
const MOST_READ_KEY = "batcave.ui.mostRead";
const RECENTLY_ADDED_KEY = "batcave.ui.recentlyAdded";

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

export class BatCaveSettingsForm extends Form {
  private update(key: string, value: boolean): void {
    Application.setState(value, key);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateLatest(value: boolean): Promise<void> {
    this.update(LATEST_KEY, value);
  }

  async updateTopRated(value: boolean): Promise<void> {
    this.update(TOP_RATED_KEY, value);
  }

  async updateMostRead(value: boolean): Promise<void> {
    this.update(MOST_READ_KEY, value);
  }

  async updateRecentlyAdded(value: boolean): Promise<void> {
    this.update(RECENTLY_ADDED_KEY, value);
  }

  async resetHome(): Promise<void> {
    Application.setState(true, LATEST_KEY);
    Application.setState(true, TOP_RATED_KEY);
    Application.setState(true, MOST_READ_KEY);
    Application.setState(true, RECENTLY_ADDED_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  override getSections() {
    return [
      Section(
        {
          id: "batcave_home",
          footer: "Choose the BatCave sections you want on the source Home screen.",
        },
        [
          LabelRow("profile", {
            title: "Source profile",
            value: "US comics · large archive · frequent updates",
          }),
          ToggleRow("latest", {
            title: "Latest Updates",
            subtitle: "Recently updated comics",
            value: readBool(LATEST_KEY, true),
            onValueChange: Application.Selector(this as BatCaveSettingsForm, "updateLatest"),
          }),
          ToggleRow("top_rated", {
            title: "Top Rated",
            value: readBool(TOP_RATED_KEY, true),
            onValueChange: Application.Selector(this as BatCaveSettingsForm, "updateTopRated"),
          }),
          ToggleRow("most_read", {
            title: "Most Read",
            value: readBool(MOST_READ_KEY, true),
            onValueChange: Application.Selector(this as BatCaveSettingsForm, "updateMostRead"),
          }),
          ToggleRow("recently_added", {
            title: "Recently Added",
            value: readBool(RECENTLY_ADDED_KEY, true),
            onValueChange: Application.Selector(this as BatCaveSettingsForm, "updateRecentlyAdded"),
          }),
          ButtonRow("reset_home", {
            title: "Reset BatCave Home",
            onSelect: Application.Selector(this as BatCaveSettingsForm, "resetHome"),
          }),
        ],
      ),
      Section(
        {
          id: "batcave_network",
          footer: "Latest Updates covers use an HTTPS relay to prevent insecure redirects. Chapter pages use direct URLs for fast loading.",
        },
        [
          LabelRow("cloudflare", {
            title: "Cloudflare",
            value: "Up-front verification · persistent session",
          }),
          LabelRow("ats", {
            title: "Image transport",
            value: "Latest covers protected · chapter pages direct",
          }),
        ],
      ),
    ];
  }
}
`;

const READ_COMICS_SETTINGS = `import { ButtonRow, Form, InputRow, LabelRow, Section, ToggleRow } from "@paperback/types";

const BASE_URL_KEY = "mmrcms.baseUrlOverride.Read Comics Online";
const DEFAULT_BASE_URL = "https://readcomicsonline.ru";
const LATEST_KEY = "readComicsOnline.ui.latest";
const POPULAR_KEY = "readComicsOnline.ui.popular";

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

function currentOverride(): string {
  const value = Application.getState(BASE_URL_KEY);
  return typeof value === "string" ? value : "";
}

export class ReadComicsOnlineSettingsForm extends Form {
  private override = currentOverride();

  async updateLatest(value: boolean): Promise<void> {
    Application.setState(value, LATEST_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updatePopular(value: boolean): Promise<void> {
    Application.setState(value, POPULAR_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateOverride(value: string): Promise<void> {
    this.override = value;
    const normalized = value.trim().replace(/\/+$/, "").replace(/^http:\/\//u, "https://");
    Application.setState(normalized, BASE_URL_KEY);
    this.reloadForm();
  }

  async resetOverride(): Promise<void> {
    this.override = "";
    Application.setState("", BASE_URL_KEY);
    this.reloadForm();
  }

  async resetHome(): Promise<void> {
    Application.setState(true, LATEST_KEY);
    Application.setState(true, POPULAR_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  override getSections() {
    const effective = this.override.trim().length > 0 ? this.override.trim() : DEFAULT_BASE_URL;
    return [
      Section(
        {
          id: "rco_home",
          footer: "A compact Home focused on fresh releases and popular comics.",
        },
        [
          LabelRow("profile", { title: "Source profile", value: "English comics · MMRCMS reader" }),
          ToggleRow("latest", {
            title: "Latest Releases",
            value: readBool(LATEST_KEY, true),
            onValueChange: Application.Selector(this as ReadComicsOnlineSettingsForm, "updateLatest"),
          }),
          ToggleRow("popular", {
            title: "Most Viewed",
            value: readBool(POPULAR_KEY, true),
            onValueChange: Application.Selector(this as ReadComicsOnlineSettingsForm, "updatePopular"),
          }),
          ButtonRow("reset_home", {
            title: "Reset Home",
            onSelect: Application.Selector(this as ReadComicsOnlineSettingsForm, "resetHome"),
          }),
        ],
      ),
      Section(
        {
          id: "rco_connection",
          footer: "Only change the domain if the site moves. HTTP overrides are automatically upgraded to HTTPS.",
        },
        [
          InputRow("base_url", {
            title: "Custom domain",
            value: this.override,
            onValueChange: Application.Selector(this as ReadComicsOnlineSettingsForm, "updateOverride"),
          }),
          LabelRow("effective", { title: "Current domain", value: effective }),
          LabelRow("cloudflare", {
            title: "Cloudflare",
            value: "Persistent session · deduplicated challenge",
          }),
          ButtonRow("reset_url", {
            title: "Reset default domain",
            onSelect: Application.Selector(this as ReadComicsOnlineSettingsForm, "resetOverride"),
          }),
        ],
      ),
    ];
  }
}
`;

const READ_COMICS_MAIN = `import {
  ContentRating,
  DiscoverSectionType,
  type DiscoverSection,
  type Form,
  type SortingOption,
} from "@paperback/types";
import { MMRCMSExtension } from "../utils/mmrcms/template";
import { ReadComicsOnlineSettingsForm } from "./settings";

const LATEST_KEY = "readComicsOnline.ui.latest";
const POPULAR_KEY = "readComicsOnline.ui.popular";

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

class ReadComicsOnlineExtension extends MMRCMSExtension {
  constructor() {
    super({
      name: "Read Comics Online",
      baseUrl: "https://readcomicsonline.ru",
      itemPath: "comic",
      contentRating: ContentRating.EVERYONE,
      langCode: "🇬🇧",
    });
  }

  override async getSettingsForm(): Promise<Form> {
    return new ReadComicsOnlineSettingsForm();
  }

  override async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [];
    if (readBool(LATEST_KEY, true)) {
      sections.push({
        id: "latest_section",
        title: "Latest Releases",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if (readBool(POPULAR_KEY, true)) {
      sections.push({
        id: "popular_section",
        title: "Most Viewed",
        type: DiscoverSectionType.featured,
      });
    }
    return sections;
  }

  override async getSortingOptions(): Promise<SortingOption[]> {
    return [
      { id: "latest", label: "Latest" },
      { id: "views", label: "Most Viewed" },
    ];
  }
}

export const ReadComicsOnline = new ReadComicsOnlineExtension();
`;

await writeFile("src/Batcave/forms.ts", BATCAVE_FORMS);
await writeFile("src/Batcave/settings.ts", BATCAVE_SETTINGS);
await writeFile("src/ReadComicsOnline/main.ts", READ_COMICS_MAIN);
await writeFile("src/ReadComicsOnline/settings.ts", READ_COMICS_SETTINGS);

await patchExact(
  "src/Batcave/main.ts",
  "BatCave English discover labels",
  `        title: "Ultime uscite",
        type: DiscoverSectionType.simpleCarousel,`,
  `        title: "Latest Updates",
        type: DiscoverSectionType.simpleCarousel,`,
);
await patchExact(
  "src/Batcave/main.ts",
  "BatCave English top-rated label",
  '        title: "Più apprezzati",',
  '        title: "Top Rated",',
);
await patchExact(
  "src/Batcave/main.ts",
  "BatCave English most-read label",
  '        title: "Più letti",',
  '        title: "Most Read",',
);
await patchExact(
  "src/Batcave/main.ts",
  "BatCave English recently-added label",
  '        title: "Aggiunti di recente",',
  '        title: "Recently Added",',
);

await patchExact(
  "src/Batcave/main.ts",
  "BatCave Latest Updates cover routing",
  `        const img = el.find(".latest__img img").first();
        const imageUrl = this.absoluteUrl(
          img.attr("data-src") || img.attr("src") || "",
        );`,
  `        const img = el.find(".latest__img img").first();
        const imageUrl = this.latestCoverUrl(
          img.attr("data-src") || img.attr("src") || "",
        );`,
);

const BATCAVE_IMAGE_HELPERS = `  private absoluteUrl(src: string): string {
    const value = (src || "").trim();
    if (!value) return "";
    if (value.startsWith("data:") || value.startsWith("blob:")) return value;
    if (value.startsWith("http://")) {
      const origin = value.replace(/^http:\/\//u, "");
      return "https://wsrv.nl/?url=" + encodeURIComponent(origin) + "&q=100";
    }
    if (value.startsWith("https://")) return value;
    if (value.startsWith("//")) return "https:" + value;
    return value.startsWith("/") ? BASE_URL + value : BASE_URL + "/" + value;
  }

  private latestCoverUrl(src: string): string {
    const direct = this.absoluteUrl(src);
    if (!direct || direct.startsWith("data:") || direct.startsWith("blob:")) return direct;
    const origin = direct.replace(/^https?:\/\//u, "");
    return "https://images.weserv.nl/?url=" + encodeURIComponent(origin) + "&q=100";
  }`;

await patchRegex(
  "src/Batcave/main.ts",
  "BatCave split cover and chapter image routing",
  /  private absoluteUrl\(src: string\): string \{[\s\S]*?\n  \}\n\n  private parseStatus/u,
  `${BATCAVE_IMAGE_HELPERS}\n\n  private parseStatus`,
);

await patchExact(
  "src/Batcave/pbconfig.ts",
  "BatCave version 1.4.12.8",
  '  version: "1.4.12.5",',
  '  version: "1.4.12.8",',
);
await patchExact(
  "src/Batcave/pbconfig.ts",
  "BatCave English description",
  '  description:\n    "Comics in inglese da BatCave, con Home dedicata, ricerca avanzata, sessione Cloudflare persistente e protezione ATS delle immagini esterne.",',
  '  description:\n    "English comics from BatCave with a dedicated Home, advanced search, persistent Cloudflare session and ATS-safe Latest Updates covers.",',
);

await patchExact(
  "src/ReadComicsOnline/pbconfig.ts",
  "Read Comics Online version 1.4.15.8",
  '  version: "1.4.15.5",',
  '  version: "1.4.15.8",',
);
await patchExact(
  "src/ReadComicsOnline/pbconfig.ts",
  "Read Comics Online English description",
  '  description: "Comics in inglese da Read Comics Online, con Home e impostazioni dedicate, ricerca ordinabile e sessione Cloudflare persistente.",',
  '  description: "English comics from Read Comics Online with a dedicated Home, source settings, sortable browsing and a persistent Cloudflare session.",',
);

// Featured "Top rated" banners: synopsis plus publisher/year badges from the list markup.
await patchExact(
  "src/Batcave/main.ts",
  "BatCave featured helpers import",
  'import * as cheerio from "cheerio";',
  'import { INFO_SYMBOLS, infoItems, shortSummary } from "../common/discover";\nimport * as cheerio from "cheerio";',
);
await patchExact(
  "src/Batcave/main.ts",
  "BatCave list item details type",
  "      mangaId: string;\n      title: string;\n      imageUrl: string;\n    }) => void,",
  "      mangaId: string;\n      title: string;\n      imageUrl: string;\n      summary: string;\n      meta: string[];\n    }) => void,",
);
await patchExact(
  "src/Batcave/main.ts",
  "BatCave list item details",
  "      cb({ mangaId: this.parsePath(href), title, imageUrl });",
  [
    '      const summary = el.find(".readed__info").first().text().replace(/\\s+/g, " ").trim();',
    "      const meta = el",
    '        .find(".readed__meta-item")',
    "        .toArray()",
    "        .map((item) => $(item).text().trim())",
    "        .filter(Boolean);",
    "      cb({ mangaId: this.parsePath(href), title, imageUrl, summary, meta });",
  ].join("\n"),
);
await patchExact(
  "src/Batcave/main.ts",
  "BatCave featured top rated details",
  [
    "    this.eachListItem($, (parsed) => {",
    "      items.push({",
    "        type:",
    '          section.id === "top_rated" ? "featuredCarouselItem" : "simpleCarouselItem",',
    "        mangaId: parsed.mangaId,",
    "        imageUrl: parsed.imageUrl,",
    "        title: parsed.title,",
    "        metadata: undefined,",
    "      });",
    "    });",
  ].join("\n"),
  [
    "    this.eachListItem($, (parsed) => {",
    '      if (section.id === "top_rated") {',
    "        items.push({",
    '          type: "featuredCarouselItem",',
    "          mangaId: parsed.mangaId,",
    "          imageUrl: parsed.imageUrl,",
    "          title: parsed.title,",
    "          summary: shortSummary(parsed.summary),",
    "          infoItems: infoItems(",
    "            { symbol: INFO_SYMBOLS.publisher, text: parsed.meta[0] },",
    "            { symbol: INFO_SYMBOLS.year, text: parsed.meta[1] },",
    "          ),",
    "          metadata: undefined,",
    "        });",
    "        return;",
    "      }",
    "      items.push({",
    '        type: "simpleCarouselItem",',
    "        mangaId: parsed.mangaId,",
    "        imageUrl: parsed.imageUrl,",
    "        title: parsed.title,",
    "        metadata: undefined,",
    "      });",
    "    });",
  ].join("\n"),
);

// Series details (live page, 27 Oct 2026): Writer/Artist values are links, so
// ownText() — which drops child elements — returned nothing; the "In
// collections" block reuses `div.page__tags` for user folders ("All of DC 1535"),
// which leaked into the genres. Read the row after its label and keep only the
// genre links (`/ComicList/g=<id>/`).
await patchExact(
  "src/Batcave/main.ts",
  "BatCave details rows",
  [
    "    const author = this.ownText(",
    '      $(".page__list > li:has(> div:contains(Writer))").first(),',
    "    );",
    "    const artist = this.ownText(",
    '      $(".page__list > li:has(> div:contains(Artist))").first(),',
    "    );",
    "    const statusText = this.ownText(",
    '      $(".page__list > li:has(> div:contains(Release type))").first(),',
    "    );",
    "",
    '    const genres = $("div.page__tags a")',
  ].join("\n"),
  [
    '    const author = this.listValue($, "Writer");',
    '    const artist = this.listValue($, "Artist");',
    '    const statusText = this.listValue($, "Release type");',
    "",
    "    const genres = $(\"div.page__tags a[href*='/ComicList/g=']\")",
  ].join("\n"),
);
await patchExact(
  "src/Batcave/main.ts",
  "BatCave details row helper",
  "  private ownText(el: Cheerio<AnyNode>): string {\n    return el.clone().children().remove().end().text().trim();\n  }",
  [
    '  // `<li><div>Writer:</div> <a>Name</a>, <a>Name</a></li>` → "Name, Name".',
    "  private listValue($: CheerioAPI, label: string): string {",
    '    const row = $(".page__list > li")',
    "      .filter(",
    "        (_, li) =>",
    '          $(li).children("div").first().text().trim().replace(/:$/u, "") === label,',
    "      )",
    "      .first()",
    "      .clone();",
    '    row.children("div").first().remove();',
    '    return row.text().replace(/\\s+/gu, " ").trim();',
    "  }",
  ].join("\n"),
);
await patchExact(
  "src/Batcave/main.ts",
  "BatCave unused ownText imports",
  'import { CheerioAPI, Cheerio } from "cheerio";\nimport type { AnyNode } from "domhandler";\n',
  'import { CheerioAPI } from "cheerio";\n',
);

// Read Comics Online against the live site (27 Oct 2026), in the MMRCMS template
// (Read Comics Online is its only consumer):
// - title search used the JSON autocomplete, which stops at 8 suggestions
//   ("batman" → 8 of several pages); use the site's paginated /advanced-search;
// - browsing stopped after 5 pages although the list keeps going;
// - the synopsis paragraph is no longer `p.mt-5`, so it was always empty;
// - "#Annual 2025" became chapter 2025 and "#Annual 5" collided with issue #5:
//   the issue number comes from the chapter slug, annuals/specials get 0 and
//   keep their name; "#24" alone has no title beyond the number;
// - some list titles are double-encoded ("Tangle &amp;amp; Whisper").
const MMRCMS = "src/utils/mmrcms/template.ts";
await patchRegex(
  MMRCMS,
  "MMRCMS search and list parsing",
  /  async getSearchResults\([\s\S]*?\n  \}\n\n  \/\/ -+\n  \/\/ Manga details/u,
  `  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as MMRCMSSearchMetadata | undefined;
    const page = meta?.page ?? 1;
    const titleQuery = (query.title || "").trim();

    const url = titleQuery
      ? \`\${this.baseUrl}/advanced-search?name=\${encodeURIComponent(titleQuery)}&page=\${page}\`
      : \`\${this.baseUrl}/comic-list?sort=\${sortingOption?.id || "views"}&page=\${page}\`;
    const $ = await this.fetchCheerio({ url, method: "GET" });
    // Only the previous page is remembered: enough to drop titles that moved
    // across the page boundary while browsing, without growing the metadata.
    const previous = new Set<string>(meta?.collectedIds ?? []);
    const pageIds: string[] = [];
    const results: SearchResultItem[] = [];
    const add = (mangaId: string, title: string, image: string) => {
      if (!title || !mangaId || previous.has(mangaId) || pageIds.includes(mangaId)) return;
      pageIds.push(mangaId);
      results.push({ mangaId, imageUrl: image, title, subtitle: undefined, metadata: undefined });
    };
    if (titleQuery) this.eachSearchItem($, add);
    else this.eachListItem($, add);

    const hasNextPage = $("nav a[rel=next]").length > 0;
    return {
      items: results,
      metadata: hasNextPage ? { page: page + 1, collectedIds: pageIds } : undefined,
    };
  }

  private eachListItem(
    $: CheerioAPI,
    cb: (mangaId: string, title: string, image: string) => void,
  ): void {
    $("div.comic-list-layout .grid > .group").each((_, element) => {
      const el = $(element);
      const link = el.find("a.block.text-sm.font-semibold").first();
      const href = link.attr("href") || "";
      const title = this.decodeTitle(link.text());
      const mangaId = this.parsePath(href);
      const rawSrc = el.find("img").first().attr("src");
      const image = this.guessCover(this.stripDomain(href), rawSrc);
      cb(mangaId, title, image);
    });
  }

  // /advanced-search cards: <a class="group" href="/comic/…"><img><p>Title</p></a>
  private eachSearchItem(
    $: CheerioAPI,
    cb: (mangaId: string, title: string, image: string) => void,
  ): void {
    $(".grid > a.group[href*='/comic/']").each((_, element) => {
      const el = $(element);
      const href = el.attr("href") || "";
      const title = this.decodeTitle(el.find("p").first().text());
      const rawSrc = el.find("img").first().attr("src");
      cb(this.parsePath(href), title, this.guessCover(this.stripDomain(href), rawSrc));
    });
  }

  private decodeTitle(text: string): string {
    return text
      .replace(/\\s+/gu, " ")
      .trim()
      .replace(/&#0?39;/gu, "'")
      .replace(/&quot;/gu, '"')
      .replace(/&amp;/gu, "&");
  }

  // ----------------------------------------------------------------
  // Manga details`,
);
await patchExact(
  MMRCMS,
  "MMRCMS synopsis",
  '    const description = $("p.mt-5.text-sm").first().text().trim();',
  '    const description = $("p.text-sm.leading-relaxed").first().text().trim();',
);
await patchRegex(
  MMRCMS,
  "MMRCMS chapter numbering",
  /    const mangaTitle = \$\("h1\.text-2xl"\)\.first\(\)\.text\(\)\.trim\(\);\n\n    const chapters[\s\S]*?\n    return chapters;\n  \}/u,
  `    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    $(".overflow-hidden.border-ink-600 > a").each((_, element) => {
      const el = $(element);
      const href = el.attr("href") || "";
      if (!href) return;
      const chapterId = this.parsePath(href);
      if (seen.has(chapterId)) return;
      seen.add(chapterId);

      const label = (el.find(".text-brand-400").first().text() || el.text())
        .replace(/\\s+/gu, " ")
        .trim()
        .replace(/^#\\s*/u, "");
      const slug = this.safeDecode(this.stripDomain(href).split("/").pop() || "");
      const { chapNum, title } = this.chapterNumber(slug, label);
      const dateStr = el.find(".text-slate-500").first().text();

      chapters.push({
        chapterId,
        sourceManga,
        title,
        volume: 0,
        chapNum,
        publishDate: this.parseDate(dateStr) ?? new Date(0),
        langCode: this.langCode,
      });
    });

    return chapters;
  }

  // Issues: "#24" → slug \`24\`; variants keep a numeric slug ("#1 Noir Edition"
  // → \`1.1\`). Annuals and specials ("#Annual 5" → \`Annual5\`, "#1 - Director's
  // Cut") have no issue number of their own: chapter 0, titled by their name.
  private chapterNumber(slug: string, label: string): { chapNum: number; title: string } {
    if (!/^\\d+(?:\\.\\d+)?$/u.test(slug)) return { chapNum: 0, title: label };
    const issue = label.match(/^\\d+(?:\\.\\d+)?(?:\\s+(.*))?$/u);
    return { chapNum: Number(slug), title: issue ? (issue[1] ?? "").trim() : label };
  }`,
);
await patchRegex(
  MMRCMS,
  "MMRCMS chapter name helper",
  /  private cleanChapterName\([\s\S]*?\n  \}\n\n/u,
  "",
);
await patchRegex(
  MMRCMS,
  "MMRCMS date parsing",
  /  private parseDate\(text: string\): Date \| undefined \{[\s\S]*?\n  \}/u,
  `  // "09 Oct 2024", read explicitly: JavaScriptCore's free-form Date parsing is
  // not something to rely on.
  private parseDate(text: string): Date | undefined {
    const t = text.trim();
    const m = t.match(/^(\\d{1,2}) ([A-Za-z]{3})[a-z]* (\\d{4})$/u);
    if (m) {
      const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        .indexOf((m[2] ?? "").toLowerCase());
      if (month >= 0) return new Date(Number(m[3]), month, Number(m[1]));
    }
    const d = new Date(t);
    return t && !isNaN(d.getTime()) ? d : undefined;
  }`,
);
await patchExact(
  MMRCMS,
  "MMRCMS unused search paging limits",
  "  static readonly MAX_SEARCH_PAGES = 5;\n  static readonly SEARCH_PAGE_SIZE = 24;\n\n",
  "",
);
await patchRegex(
  MMRCMS,
  "MMRCMS unused autocomplete types",
  /interface MMRCMSSuggestion \{[\s\S]*?\ninterface MMRCMSSearchResult \{[\s\S]*?\n\}\n\n/u,
  "",
);

const batcave = await readFile("src/Batcave/main.ts", "utf8");
if (!batcave.includes("latestCoverUrl")) {
  throw new Error("BatCave Latest Updates cover protection was not installed.");
}
if (!batcave.includes("pages.push(this.absoluteUrl(trimmed));")) {
  throw new Error("BatCave chapter pages are no longer using direct image routing.");
}
if (batcave.includes('title: "Ultime uscite"')) {
  throw new Error("BatCave Italian UI labels are still present.");
}

// Upstream ships the generic MMRCMS "CMS" icon; use the site's own logo instead.
await copyFile("scripts/icons/ReadComicsOnline.png", "src/ReadComicsOnline/static/icon.png");

console.log("Finalized English Comics UI and split BatCave cover/chapter image routing.");
