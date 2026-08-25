import { readFile, writeFile } from "node:fs/promises";

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
  "BatCave version 1.4.9.6",
  '  version: "1.4.9.5",',
  '  version: "1.4.9.6",',
);
await patchExact(
  "src/Batcave/pbconfig.ts",
  "BatCave English description",
  '  description:\n    "Comics in inglese da BatCave, con Home dedicata, ricerca avanzata, sessione Cloudflare persistente e protezione ATS delle immagini esterne.",',
  '  description:\n    "English comics from BatCave with a dedicated Home, advanced search, persistent Cloudflare session and ATS-safe Latest Updates covers.",',
);

await patchExact(
  "src/ReadComicsOnline/pbconfig.ts",
  "Read Comics Online version 1.4.14.6",
  '  version: "1.4.14.5",',
  '  version: "1.4.14.6",',
);
await patchExact(
  "src/ReadComicsOnline/pbconfig.ts",
  "Read Comics Online English description",
  '  description: "Comics in inglese da Read Comics Online, con Home e impostazioni dedicate, ricerca ordinabile e sessione Cloudflare persistente.",',
  '  description: "English comics from Read Comics Online with a dedicated Home, source settings, sortable browsing and a persistent Cloudflare session.",',
);

const batcave = await readFile("src/Batcave/main.ts", "utf8");
if (!batcave.includes("latestCoverUrl")) {
  throw new Error("BatCave Latest Updates cover protection was not installed.");
}
if (!batcave.includes('pages.push(this.absoluteUrl(trimmed));')) {
  throw new Error("BatCave chapter pages are no longer using direct image routing.");
}
if (batcave.includes('title: "Ultime uscite"')) {
  throw new Error("BatCave Italian UI labels are still present.");
}

console.log("Finalized English Comics UI and split BatCave cover/chapter image routing.");
