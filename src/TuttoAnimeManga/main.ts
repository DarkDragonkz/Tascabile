import {
  AdvancedSearchForm,
  ButtonRow,
  DiscoverSectionType,
  Form,
  LabelRow,
  Section,
  SelectRow,
  ToggleRow,
  type DiscoverSection,
  type DiscoverSectionItem,
  type JSONObject,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
} from "@paperback/types";

import FansubGeneral, { type CatalogSort } from "../FansubGeneric/main";
import type { ComicListItem } from "../FansubGeneric/models";
import pbconfig from "./pbconfig";

const DOMAIN = "https://tuttoanimemanga.net/api";
const SHOW_CLASSICS_KEY = "tam.ui.showClassics";
const SHOW_ARCHIVE_KEY = "tam.ui.showArchive";
const HIDE_ADULT_KEY = "tam.ui.hideAdult";
const CLASSIC_TITLES = [
  "one piece",
  "naruto",
  "bleach",
  "detective conan",
  "fairy tail",
  "hunter",
  "gintama",
  "haikyuu",
  "claymore",
  "d.gray",
];
const RECENT_DAYS = 365;

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

function isClassic(comic: ComicListItem): boolean {
  const title = comic.title.toLocaleLowerCase("it");
  return CLASSIC_TITLES.some((needle) => title.includes(needle));
}

interface TamSearchMeta extends JSONObject {
  sort: string[];
  focus: string[];
}

class TamSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private focus: string[];

  constructor(meta?: TamSearchMeta) {
    super();
    this.sort = meta?.sort ?? ["recent"];
    this.focus = meta?.focus ?? ["all"];
  }

  async updateSort(value: string[]): Promise<void> {
    this.sort = value;
    this.reloadForm();
  }

  async updateFocus(value: string[]): Promise<void> {
    this.focus = value;
    this.reloadForm();
  }

  getSearchQueryMetadata(): JSONObject {
    return { searchMeta: { sort: this.sort, focus: this.focus } satisfies TamSearchMeta };
  }

  override getSections() {
    return [
      Section(
        {
          id: "tam_scope",
          footer: "TAM contiene un archivio molto esteso: i filtri aiutano a separare le release recenti dai grandi classici storici del catalogo.",
        },
        [
          SelectRow("focus", {
            title: "Esplora",
            value: this.focus,
            options: [
              { id: "all", title: "Tutto il catalogo" },
              { id: "recent", title: "Aggiornati nell'ultimo anno" },
              { id: "classics", title: "Classici TAM" },
              { id: "archive", title: "Archivio storico" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as TamSearchForm, "updateFocus"),
          }),
          SelectRow("sort", {
            title: "Ordina",
            value: this.sort,
            options: [
              { id: "recent", title: "Ultima uscita" },
              { id: "title_asc", title: "Titolo A-Z" },
              { id: "title_desc", title: "Titolo Z-A" },
              { id: "author", title: "Autore A-Z" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as TamSearchForm, "updateSort"),
          }),
        ],
      ),
    ];
  }
}

class TamSettingsForm extends Form {
  private status = "Pronto";

  constructor(private readonly source: FansubGeneral) {
    super();
  }

  async updateClassics(value: boolean): Promise<void> {
    Application.setState(value, SHOW_CLASSICS_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateArchive(value: boolean): Promise<void> {
    Application.setState(value, SHOW_ARCHIVE_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateAdult(value: boolean): Promise<void> {
    Application.setState(value, HIDE_ADULT_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async testConnection(): Promise<void> {
    this.status = "Verifica in corso…";
    this.reloadForm();
    this.status = (await this.source.checkApi()) ? "TAM raggiungibile" : "TAM non raggiungibile";
    this.reloadForm();
  }

  async clearCache(): Promise<void> {
    this.source.clearNetworkCache();
    this.status = "Cache svuotata";
    this.reloadForm();
  }

  override getSections() {
    return [
      Section(
        {
          id: "tam_home",
          footer: "La Home è organizzata come una biblioteca: novità, classici e archivio completo restano chiaramente separati.",
        },
        [
          LabelRow("profile", { title: "Profilo", value: "Grande archivio manga italiano" }),
          ToggleRow("classics", {
            title: "Mostra Classici TAM",
            subtitle: "One Piece, Naruto, Bleach, Conan e altri titoli storici",
            value: readBool(SHOW_CLASSICS_KEY, true),
            onValueChange: Application.Selector(this as TamSettingsForm, "updateClassics"),
          }),
          ToggleRow("archive", {
            title: "Mostra archivio A-Z",
            value: readBool(SHOW_ARCHIVE_KEY, true),
            onValueChange: Application.Selector(this as TamSettingsForm, "updateArchive"),
          }),
        ],
      ),
      Section("tam_content", [
        ToggleRow("hide_adult", {
          title: "Nascondi contenuti per adulti",
          value: readBool(HIDE_ADULT_KEY, false),
          onValueChange: Application.Selector(this as TamSettingsForm, "updateAdult"),
        }),
      ]),
      Section(
        { id: "tam_maintenance", footer: "TAM ha un catalogo molto grande: la cache evita di ricaricarlo inutilmente." },
        [
          LabelRow("status", { title: "Stato TAM", value: this.status }),
          ButtonRow("test", {
            title: "Verifica TuttoAnimeManga",
            onSelect: Application.Selector(this as TamSettingsForm, "testConnection"),
          }),
          ButtonRow("clear", {
            title: "Svuota cache TAM",
            onSelect: Application.Selector(this as TamSettingsForm, "clearCache"),
          }),
        ],
      ),
    ];
  }
}

class TuttoAnimeMangaExtension extends FansubGeneral {
  constructor() {
    super({
      domain: DOMAIN,
      name: pbconfig.name,
      contentRating: pbconfig.contentRating,
    });
  }

  protected override getHideAdult(): boolean {
    return readBool(HIDE_ADULT_KEY, false);
  }

  async getSettingsForm(): Promise<Form> {
    return new TamSettingsForm(this);
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = (query.metadata as { searchMeta?: TamSearchMeta } | undefined)?.searchMeta;
    return new TamSearchForm(meta);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [
      {
        id: "tam_latest",
        title: "Ultime uscite TAM",
        subtitle: "I capitoli più recenti del reader",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
    if (readBool(SHOW_CLASSICS_KEY, true)) {
      sections.push({
        id: "tam_classics",
        title: "Classici TAM",
        subtitle: "I titoli storici più riconoscibili dell'archivio",
        type: DiscoverSectionType.featured,
      });
    }
    if (readBool(SHOW_ARCHIVE_KEY, true)) {
      sections.push({
        id: "tam_archive",
        title: "Archivio completo",
        subtitle: "Tutte le serie in ordine alfabetico",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    return sections;
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const catalog = await this.loadCatalog();
    if (section.id === "tam_latest") {
      return {
        items: this.sortCatalog(catalog, "recent")
          .slice(0, 24)
          .map((comic) => this.toChapterUpdateItem(comic))
          .filter((item): item is DiscoverSectionItem => item !== undefined),
      };
    }
    if (section.id === "tam_classics") {
      return {
        items: this.sortCatalog(catalog.filter(isClassic), "recent").map((comic) =>
          this.toFeaturedItem(comic, "Classico TAM"),
        ),
      };
    }
    return {
      items: this.sortCatalog(catalog, "title_asc").map((comic) => this.toSimpleItem(comic)),
    };
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    _metadata: Metadata | undefined,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = (query.metadata as { searchMeta?: TamSearchMeta } | undefined)?.searchMeta;
    const focus = meta?.focus?.[0] ?? "all";
    const sort = (meta?.sort?.[0] ?? "recent") as CatalogSort;
    let comics = await this.loadSearchComics(query);
    if (focus === "recent") comics = comics.filter((comic) => this.updatedWithin(comic, RECENT_DAYS));
    if (focus === "classics") comics = comics.filter(isClassic);
    if (focus === "archive") comics = comics.filter((comic) => !this.updatedWithin(comic, RECENT_DAYS));
    return { items: this.sortCatalog(comics, sort).map((comic) => this.toSearchResult(comic)) };
  }
}

export const TuttoAnimeManga = new TuttoAnimeMangaExtension();
