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
  type Metadata,
  type PagedResults,
  type JSONObject,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
} from "@paperback/types";

import FansubGeneral, { type CatalogSort } from "../FansubGeneric/main";
import type { ComicListItem } from "../FansubGeneric/models";
import pbconfig from "./pbconfig";

const DOMAIN = "https://reader.gtothegreatsite.net/api";
const SHOW_UNIVERSE_KEY = "gto.ui.showUniverse";
const SHOW_OTHER_KEY = "gto.ui.showOtherProjects";
const HIDE_ADULT_KEY = "gto.ui.hideAdult";

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

function isGtoUniverse(comic: ComicListItem): boolean {
  return /\bGTO\b|great teacher|shonan|bad company|paradise lost|14 days/iu.test(comic.title);
}

interface GtoSearchMeta extends JSONObject {
  sort: string[];
  focus: string[];
}

class GtoSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private focus: string[];

  constructor(meta?: GtoSearchMeta) {
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
    return { searchMeta: { sort: this.sort, focus: this.focus } satisfies GtoSearchMeta };
  }

  override getSections() {
    return [
      Section(
        {
          id: "gto_search_scope",
          footer:
            "Il filtro Universo GTO raccoglie le serie legate a Onizuka e ai progetti storici del team.",
        },
        [
          SelectRow("focus", {
            title: "Area del catalogo",
            value: this.focus,
            options: [
              { id: "all", title: "Tutti i progetti" },
              { id: "gto", title: "Universo GTO" },
              { id: "other", title: "Altri progetti del team" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as GtoSearchForm, "updateFocus"),
          }),
          SelectRow("sort", {
            title: "Ordina",
            value: this.sort,
            options: [
              { id: "recent", title: "Release più recenti" },
              { id: "title_asc", title: "Titolo A-Z" },
              { id: "title_desc", title: "Titolo Z-A" },
              { id: "author", title: "Autore A-Z" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as GtoSearchForm, "updateSort"),
          }),
        ],
      ),
    ];
  }
}

class GtoSettingsForm extends Form {
  private status = "Pronto";

  constructor(private readonly source: FansubGeneral) {
    super();
  }

  async updateUniverse(value: boolean): Promise<void> {
    Application.setState(value, SHOW_UNIVERSE_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateOther(value: boolean): Promise<void> {
    Application.setState(value, SHOW_OTHER_KEY);
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
      ? "Reader raggiungibile"
      : "Reader non raggiungibile";
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
          id: "gto_home",
          footer:
            "La Home dà priorità alle release del team e mantiene separati i titoli dell'universo GTO dagli altri progetti.",
        },
        [
          LabelRow("identity", { title: "Profilo", value: "GTO + progetti del team" }),
          ToggleRow("show_universe", {
            title: "Mostra Universo GTO",
            subtitle: "Sezione dedicata a Onizuka e serie collegate",
            value: readBool(SHOW_UNIVERSE_KEY, true),
            onValueChange: Application.Selector(this as GtoSettingsForm, "updateUniverse"),
          }),
          ToggleRow("show_other", {
            title: "Mostra altri progetti",
            subtitle: "Catalogo delle altre serie tradotte dal team",
            value: readBool(SHOW_OTHER_KEY, true),
            onValueChange: Application.Selector(this as GtoSettingsForm, "updateOther"),
          }),
        ],
      ),
      Section("gto_content", [
        ToggleRow("hide_adult", {
          title: "Nascondi contenuti per adulti",
          value: readBool(HIDE_ADULT_KEY, false),
          onValueChange: Application.Selector(this as GtoSettingsForm, "updateAdult"),
        }),
      ]),
      Section(
        { id: "gto_maintenance", footer: "La cache riduce le richieste ripetute al reader." },
        [
          LabelRow("status", { title: "Stato", value: this.status }),
          ButtonRow("test", {
            title: "Verifica reader GTO",
            onSelect: Application.Selector(this as GtoSettingsForm, "testConnection"),
          }),
          ButtonRow("clear", {
            title: "Svuota cache GTO",
            onSelect: Application.Selector(this as GtoSettingsForm, "clearCache"),
          }),
        ],
      ),
    ];
  }
}

class GTOTheGreatSiteExtension extends FansubGeneral {
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
    return new GtoSettingsForm(this);
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = (query.metadata as { searchMeta?: GtoSearchMeta } | undefined)?.searchMeta;
    return new GtoSearchForm(meta);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [
      {
        id: "gto_latest",
        title: "Ultime release",
        subtitle: "I capitoli pubblicati più di recente",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
    if (readBool(SHOW_UNIVERSE_KEY, true)) {
      sections.push({
        id: "gto_universe",
        title: "Universo GTO",
        subtitle: "Onizuka e progetti collegati",
        type: DiscoverSectionType.featured,
      });
    }
    if (readBool(SHOW_OTHER_KEY, true)) {
      sections.push({
        id: "gto_other",
        title: "Altri progetti del team",
        subtitle: "Il resto del catalogo GTO The Great Site",
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
    if (section.id === "gto_latest") {
      return {
        items: this.sortCatalog(catalog, "recent")
          .slice(0, 20)
          .map((comic) => this.toChapterUpdateItem(comic))
          .filter((item): item is DiscoverSectionItem => item !== undefined),
      };
    }
    if (section.id === "gto_universe") {
      return {
        items: this.sortCatalog(catalog.filter(isGtoUniverse), "recent").map((comic) =>
          this.toFeaturedItem(comic, "Universo GTO"),
        ),
      };
    }
    return {
      items: this.sortCatalog(
        catalog.filter((comic) => !isGtoUniverse(comic)),
        "title_asc",
      ).map((comic) => this.toSimpleItem(comic)),
    };
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    _metadata: Metadata | undefined,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = (query.metadata as { searchMeta?: GtoSearchMeta } | undefined)?.searchMeta;
    const focus = meta?.focus?.[0] ?? "all";
    const sort = (meta?.sort?.[0] ?? "recent") as CatalogSort;
    let comics = await this.loadSearchComics(query);
    if (focus === "gto") comics = comics.filter(isGtoUniverse);
    if (focus === "other") comics = comics.filter((comic) => !isGtoUniverse(comic));
    return { items: this.sortCatalog(comics, sort).map((comic) => this.toSearchResult(comic)) };
  }
}

export const GTOTheGreatSite = new GTOTheGreatSiteExtension();
