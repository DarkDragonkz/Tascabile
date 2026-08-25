import { readFile, writeFile } from "node:fs/promises";

async function patchExact(path, label, target, replacement) {
  const source = await readFile(path, "utf8");
  if (!source.includes(target)) {
    throw new Error(`${label} changed; review the generated source before building.`);
  }
  await writeFile(path, source.replace(target, replacement));
}

async function patchRegex(path, label, pattern, replacement) {
  const source = await readFile(path, "utf8");
  if (!pattern.test(source)) {
    throw new Error(`${label} changed; review the generated source before building.`);
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
  { id: "", title: "Predefinito" },
  { id: "editdate", title: "Ultimo aggiornamento" },
  { id: "date", title: "Data di pubblicazione" },
  { id: "rating", title: "Valutazione" },
  { id: "news_read", title: "Più letti" },
  { id: "comm_num", title: "Più commentati" },
  { id: "title", title: "Titolo" },
];

const DIRECTION_OPTIONS = [
  { id: "desc", title: "Decrescente" },
  { id: "asc", title: "Crescente" },
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
          footer: "Usa questi filtri per esplorare il grande archivio Comics di BatCave anche senza inserire un titolo.",
        },
        [
          SelectRow("sort", {
            title: "Ordina per",
            value: this.sort,
            options: SORT_OPTIONS,
            minItemCount: 0,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as BatCaveSearchForm, "updateSort"),
          }),
          SelectRow("direction", {
            title: "Direzione",
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
          footer: "L'intervallo anno viene applicato alla navigazione del catalogo BatCave.",
        },
        [
          InputRow("year_from", {
            title: "Anno da",
            value: this.yearFrom,
            onValueChange: Application.Selector(this as BatCaveSearchForm, "updateYearFrom"),
          }),
          InputRow("year_to", {
            title: "Anno a",
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
          footer: "La Home è modellata sulle aree più utili del catalogo BatCave, senza duplicare la stessa lista con nomi diversi.",
        },
        [
          LabelRow("profile", {
            title: "Profilo",
            value: "Comics USA · catalogo esteso · aggiornamenti frequenti",
          }),
          ToggleRow("latest", {
            title: "Ultime uscite",
            subtitle: "Aggiornamenti pubblicati di recente",
            value: readBool(LATEST_KEY, true),
            onValueChange: Application.Selector(this as BatCaveSettingsForm, "updateLatest"),
          }),
          ToggleRow("top_rated", {
            title: "Più apprezzati",
            subtitle: "Serie ordinate per valutazione",
            value: readBool(TOP_RATED_KEY, true),
            onValueChange: Application.Selector(this as BatCaveSettingsForm, "updateTopRated"),
          }),
          ToggleRow("most_read", {
            title: "Più letti",
            value: readBool(MOST_READ_KEY, true),
            onValueChange: Application.Selector(this as BatCaveSettingsForm, "updateMostRead"),
          }),
          ToggleRow("recently_added", {
            title: "Aggiunti di recente",
            value: readBool(RECENTLY_ADDED_KEY, true),
            onValueChange: Application.Selector(this as BatCaveSettingsForm, "updateRecentlyAdded"),
          }),
          ButtonRow("reset_home", {
            title: "Ripristina Home BatCave",
            onSelect: Application.Selector(this as BatCaveSettingsForm, "resetHome"),
          }),
        ],
      ),
      Section(
        {
          id: "batcave_network",
          footer: "Le immagini esterne vengono isolate dietro un endpoint HTTPS per impedire redirect HTTP incompatibili con App Transport Security.",
        },
        [
          LabelRow("cloudflare", {
            title: "Cloudflare",
            value: "Verifica preventiva + sessione riutilizzata",
          }),
          LabelRow("ats", {
            title: "Sicurezza immagini",
            value: "HTTPS protetto da redirect non sicuri",
          }),
        ],
      ),
    ];
  }
}
`;

const READ_COMICS_SETTINGS = `import { ButtonRow, Form, InputRow, LabelRow, Section, ToggleRow } from "@paperback/types";

const SOURCE_NAME = "Read Comics Online";
const DEFAULT_BASE_URL = "https://readcomicsonline.ru";
const BASE_URL_KEY = \`mmrcms.baseUrlOverride.\${SOURCE_NAME}\`;
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
    const normalized = value.trim().replace(/\\/+$/, "").replace(/^http:\\/\\//u, "https://");
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
          footer: "Read Comics Online è una fonte orientata alla consultazione rapida: Home compatta con novità e titoli più visti.",
        },
        [
          LabelRow("profile", { title: "Profilo", value: "Comics in inglese · reader MMRCMS" }),
          ToggleRow("latest", {
            title: "Ultime uscite",
            value: readBool(LATEST_KEY, true),
            onValueChange: Application.Selector(this as ReadComicsOnlineSettingsForm, "updateLatest"),
          }),
          ToggleRow("popular", {
            title: "Più visti",
            value: readBool(POPULAR_KEY, true),
            onValueChange: Application.Selector(this as ReadComicsOnlineSettingsForm, "updatePopular"),
          }),
          ButtonRow("reset_home", {
            title: "Ripristina Home",
            onSelect: Application.Selector(this as ReadComicsOnlineSettingsForm, "resetHome"),
          }),
        ],
      ),
      Section(
        {
          id: "rco_connection",
          footer: "Modifica il dominio solo se Read Comics Online cambia indirizzo. Gli URL HTTP vengono automaticamente convertiti in HTTPS.",
        },
        [
          InputRow("base_url", {
            title: "Dominio personalizzato",
            value: this.override,
            onValueChange: Application.Selector(this as ReadComicsOnlineSettingsForm, "updateOverride"),
          }),
          LabelRow("effective", { title: "Dominio in uso", value: effective }),
          LabelRow("cloudflare", {
            title: "Cloudflare",
            value: "Sessione persistente e challenge deduplicata",
          }),
          ButtonRow("reset_url", {
            title: "Ripristina dominio predefinito",
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
        title: "Ultime uscite",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if (readBool(POPULAR_KEY, true)) {
      sections.push({
        id: "popular_section",
        title: "Più visti",
        type: DiscoverSectionType.featured,
      });
    }
    return sections;
  }

  override async getSortingOptions(): Promise<SortingOption[]> {
    return [
      { id: "latest", label: "Più recenti" },
      { id: "views", label: "Più visti" },
    ];
  }
}

export const ReadComicsOnline = new ReadComicsOnlineExtension();
`;

await writeFile("src/Batcave/forms.ts", BATCAVE_FORMS);
await writeFile("src/Batcave/settings.ts", BATCAVE_SETTINGS);

await patchExact(
  "src/Batcave/main.ts",
  "BatCave settings import",
  'import { BatCaveSearchForm, BatCaveSearchMeta } from "./forms";',
  'import { BatCaveSearchForm, BatCaveSearchMeta } from "./forms";\nimport { BatCaveSettingsForm } from "./settings";',
);

await patchExact(
  "src/Batcave/main.ts",
  "BatCave settings provider",
  `  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
  }
`,
  `  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
  }

  async getSettingsForm() {
    return new BatCaveSettingsForm();
  }
`,
);

await patchExact(
  "src/Batcave/main.ts",
  "BatCave dedicated discover UI",
  `  async getDiscoverSections(): Promise<DiscoverSection[]> {
    await this.ensureCloudflareSession();
    return [
      {
        id: "popular",
        title: "Popular",
        type: DiscoverSectionType.featured,
      },
      {
        id: "latest",
        title: "Latest Updates",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }`,
  `  private sectionEnabled(key: string): boolean {
    const value = Application.getState(key);
    return typeof value === "boolean" ? value : true;
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    await this.ensureCloudflareSession();
    const sections: DiscoverSection[] = [];
    if (this.sectionEnabled("batcave.ui.latest")) {
      sections.push({
        id: "latest",
        title: "Ultime uscite",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if (this.sectionEnabled("batcave.ui.topRated")) {
      sections.push({
        id: "top_rated",
        title: "Più apprezzati",
        type: DiscoverSectionType.featured,
      });
    }
    if (this.sectionEnabled("batcave.ui.mostRead")) {
      sections.push({
        id: "most_read",
        title: "Più letti",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if (this.sectionEnabled("batcave.ui.recentlyAdded")) {
      sections.push({
        id: "recently_added",
        title: "Aggiunti di recente",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    return sections;
  }`,
);

await patchExact(
  "src/Batcave/main.ts",
  "BatCave discover sort routing",
  `    // Popular -> sort "rating" desc, POST to /comix/.
    const $ = await this.fetchBrowse(page, "rating", "desc");`,
  `    const sort =
      section.id === "most_read"
        ? "news_read"
        : section.id === "recently_added"
          ? "date"
          : "rating";
    const $ = await this.fetchBrowse(page, sort, "desc");`,
);

await patchExact(
  "src/Batcave/main.ts",
  "BatCave discover card type",
  '        type: "featuredCarouselItem",',
  `        type:
          section.id === "top_rated" ? "featuredCarouselItem" : "simpleCarouselItem",`,
);

const BATCAVE_SECURE_IMAGE_FUNCTION = [
  "  private absoluteUrl(src: string): string {",
  '    const value = (src || "").trim();',
  '    if (!value) return "";',
  '    if (value.startsWith("data:") || value.startsWith("blob:")) return value;',
  "",
  "    let resolved: string;",
  '    if (value.startsWith("//")) {',
  '      resolved = `https:${value}`;',
  '    } else if (value.startsWith("http://")) {',
  '      resolved = `https://${value.slice("http://".length)}`;',
  '    } else if (value.startsWith("https://")) {',
  "      resolved = value;",
  "    } else {",
  '      resolved = value.startsWith("/") ? `${BASE_URL}${value}` : `${BASE_URL}/${value}`;',
  "    }",
  "",
  "    // BatCave-local images stay direct. Every external image is fetched server-side",
  "    // through a fixed HTTPS endpoint so an origin redirect can never send iOS to HTTP.",
  '    if (resolved === BASE_URL || resolved.startsWith(`${BASE_URL}/`)) return resolved;',
  '    const proxySource = resolved.replace(/^https?:\\/\\//u, "");',
  '    return `https://images.weserv.nl/?url=${encodeURIComponent(proxySource)}&q=100`;',
  "  }",
].join("\n");

await patchRegex(
  "src/Batcave/main.ts",
  "BatCave external image ATS firewall",
  /  private absoluteUrl\(src: string\): string \{[\s\S]*?\n  \}\n\n  private parseStatus/u,
  `${BATCAVE_SECURE_IMAGE_FUNCTION}\n\n  private parseStatus`,
);

await patchExact(
  "src/Batcave/pbconfig.ts",
  "BatCave settings capability",
  "    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,",
  "    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,\n    SourceIntents.SETTINGS_FORM_PROVIDING,",
);
await patchExact(
  "src/Batcave/pbconfig.ts",
  "BatCave Tascabile UI version",
  '  version: "1.4.9.4",',
  '  version: "1.4.9.5",',
);
await patchExact(
  "src/Batcave/pbconfig.ts",
  "BatCave description",
  '  description:\n    "BatCave - custom source (batcave.biz). Converted from keiyoushi.",',
  '  description:\n    "Comics in inglese da BatCave, con Home dedicata, ricerca avanzata, sessione Cloudflare persistente e protezione ATS delle immagini esterne.",',
);
await patchExact(
  "src/Batcave/pbconfig.ts",
  "BatCave badges",
  "  badges: [],",
  '  badges: [\n    { label: "COMICS", textColor: "#FFFFFF", backgroundColor: "#263238" },\n    { label: "EN", textColor: "#FFFFFF", backgroundColor: "#455A64" },\n  ],',
);

await writeFile("src/ReadComicsOnline/main.ts", READ_COMICS_MAIN);
await writeFile("src/ReadComicsOnline/settings.ts", READ_COMICS_SETTINGS);
await patchExact(
  "src/ReadComicsOnline/pbconfig.ts",
  "Read Comics Online Tascabile UI version",
  '  version: "1.4.14.4",',
  '  version: "1.4.14.5",',
);
await patchExact(
  "src/ReadComicsOnline/pbconfig.ts",
  "Read Comics Online description",
  '  description: "Read Comics Online - MMRCMS source (readcomicsonline.ru). Converted from keiyoushi.",',
  '  description: "Comics in inglese da Read Comics Online, con Home e impostazioni dedicate, ricerca ordinabile e sessione Cloudflare persistente.",',
);
await patchRegex(
  "src/ReadComicsOnline/pbconfig.ts",
  "Read Comics Online badges",
  /  badges: \[[\s\S]*?\n  \],\n  developers:/u,
  '  badges: [\n    { label: "COMICS", textColor: "#FFFFFF", backgroundColor: "#263238" },\n    { label: "EN", textColor: "#FFFFFF", backgroundColor: "#455A64" },\n  ],\n  developers:',
);

const batcave = await readFile("src/Batcave/main.ts", "utf8");
if (!batcave.includes("https://images.weserv.nl/")) {
  throw new Error("BatCave ATS firewall was not installed.");
}
if (batcave.includes('id: "popular",\n        title: "Popular"')) {
  throw new Error("BatCave legacy discover UI is still present.");
}

console.log("Applied dedicated BatCave and Read Comics Online UI; BatCave external images are ATS-safe.");
