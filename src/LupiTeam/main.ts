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

const DOMAIN = "https://lupiteam.net/api";
const SHOW_FLAGSHIPS_KEY = "lupi.ui.showFlagships";
const SHOW_ARCHIVE_KEY = "lupi.ui.showArchive";
const HIDE_ADULT_KEY = "lupi.ui.hideAdult";
const FLAGSHIP_TITLES = ["one piece", "berserk", "hunter", "dragon ball", "one punch man"];

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

function isFlagship(comic: ComicListItem): boolean {
  const title = comic.title.toLocaleLowerCase("it");
  return FLAGSHIP_TITLES.some((needle) => title.includes(needle));
}

interface LupiSearchMeta extends JSONObject {
  sort: string[];
  focus: string[];
}

class LupiSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private focus: string[];

  constructor(meta?: LupiSearchMeta) {
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
    return { searchMeta: { sort: this.sort, focus: this.focus } satisfies LupiSearchMeta };
  }

  override getSections() {
    return [
      Section(
        {
          id: "lupi_focus",
          footer:
            "La sezione Progetti di punta raccoglie le serie per cui Lupi Team è maggiormente riconosciuto, tra cui One Piece, Berserk e Hunter × Hunter.",
        },
        [
          SelectRow("focus", {
            title: "Catalogo",
            value: this.focus,
            options: [
              { id: "all", title: "Tutte le serie" },
              { id: "flagship", title: "Progetti di punta" },
              { id: "other", title: "Altri progetti" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as LupiSearchForm, "updateFocus"),
          }),
          SelectRow("sort", {
            title: "Ordina",
            value: this.sort,
            options: [
              { id: "recent", title: "Ultimo aggiornamento" },
              { id: "title_asc", title: "Titolo A-Z" },
              { id: "title_desc", title: "Titolo Z-A" },
              { id: "author", title: "Autore A-Z" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as LupiSearchForm, "updateSort"),
          }),
        ],
      ),
    ];
  }
}

class LupiSettingsForm extends Form {
  private status = "Pronto";

  constructor(private readonly source: FansubGeneral) {
    super();
  }

  async updateFlagships(value: boolean): Promise<void> {
    Application.setState(value, SHOW_FLAGSHIPS_KEY);
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
    this.status = (await this.source.checkApi())
      ? "Lupi Team raggiungibile"
      : "Lupi Team non raggiungibile";
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
          id: "lupi_home",
          footer:
            "La Home mette in primo piano le serie simbolo del team senza nascondere il resto dell'archivio.",
        },
        [
          LabelRow("profile", { title: "Focus", value: "Serie di punta + archivio del team" }),
          ToggleRow("flagships", {
            title: "Mostra progetti di punta",
            subtitle: "One Piece, Berserk, Hunter × Hunter e altre serie principali",
            value: readBool(SHOW_FLAGSHIPS_KEY, true),
            onValueChange: Application.Selector(this as LupiSettingsForm, "updateFlagships"),
          }),
          ToggleRow("archive", {
            title: "Mostra archivio completo",
            value: readBool(SHOW_ARCHIVE_KEY, true),
            onValueChange: Application.Selector(this as LupiSettingsForm, "updateArchive"),
          }),
        ],
      ),
      Section("lupi_content", [
        ToggleRow("hide_adult", {
          title: "Nascondi contenuti per adulti",
          value: readBool(HIDE_ADULT_KEY, false),
          onValueChange: Application.Selector(this as LupiSettingsForm, "updateAdult"),
        }),
      ]),
      Section(
        {
          id: "lupi_maintenance",
          footer: "La cache mantiene più reattiva la navigazione del catalogo.",
        },
        [
          LabelRow("status", { title: "Stato Lupi Team", value: this.status }),
          ButtonRow("test", {
            title: "Verifica Lupi Team",
            onSelect: Application.Selector(this as LupiSettingsForm, "testConnection"),
          }),
          ButtonRow("clear", {
            title: "Svuota cache Lupi",
            onSelect: Application.Selector(this as LupiSettingsForm, "clearCache"),
          }),
        ],
      ),
    ];
  }
}

class LupiTeamExtension extends FansubGeneral {
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
    return new LupiSettingsForm(this);
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = (query.metadata as { searchMeta?: LupiSearchMeta } | undefined)?.searchMeta;
    return new LupiSearchForm(meta);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [
      {
        id: "lupi_latest",
        title: "Ultime uscite Lupi",
        subtitle: "Gli ultimi capitoli del team",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
    if (readBool(SHOW_FLAGSHIPS_KEY, true)) {
      sections.push({
        id: "lupi_flagships",
        title: "Progetti di punta",
        subtitle: "Le serie simbolo di Lupi Team",
        type: DiscoverSectionType.featured,
      });
    }
    if (readBool(SHOW_ARCHIVE_KEY, true)) {
      sections.push({
        id: "lupi_archive",
        title: "Archivio del branco",
        subtitle: "Tutti i manga disponibili",
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
    if (section.id === "lupi_latest") {
      return {
        items: this.sortCatalog(catalog, "recent")
          .slice(0, 20)
          .map((comic) => this.toChapterUpdateItem(comic))
          .filter((item): item is DiscoverSectionItem => item !== undefined),
      };
    }
    if (section.id === "lupi_flagships") {
      return {
        items: this.sortCatalog(catalog.filter(isFlagship), "recent").map((comic) =>
          this.toFeaturedItem(comic, "Progetto di punta"),
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
    const meta = (query.metadata as { searchMeta?: LupiSearchMeta } | undefined)?.searchMeta;
    const focus = meta?.focus?.[0] ?? "all";
    const sort = (meta?.sort?.[0] ?? "recent") as CatalogSort;
    let comics = await this.loadSearchComics(query);
    if (focus === "flagship") comics = comics.filter(isFlagship);
    if (focus === "other") comics = comics.filter((comic) => !isFlagship(comic));
    return { items: this.sortCatalog(comics, sort).map((comic) => this.toSearchResult(comic)) };
  }
}

export const LupiTeam = new LupiTeamExtension();
