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
import pbconfig from "./pbconfig";

const DOMAIN = "https://phoenixscans.com/api";
const SHOW_FRESH_KEY = "phoenix.ui.showFresh";
const SHOW_CATALOG_KEY = "phoenix.ui.showCatalog";
const SHOW_ADULT_SECTION_KEY = "phoenix.ui.showAdultSection";
const HIDE_ADULT_KEY = "phoenix.ui.hideAdult";
const FRESH_DAYS = 120;

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

interface PhoenixSearchMeta extends JSONObject {
  sort: string[];
  freshness: string[];
  audience: string[];
}

class PhoenixSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private freshness: string[];
  private audience: string[];

  constructor(meta?: PhoenixSearchMeta) {
    super();
    this.sort = meta?.sort ?? ["recent"];
    this.freshness = meta?.freshness ?? ["all"];
    this.audience = meta?.audience ?? ["all"];
  }

  async updateSort(value: string[]): Promise<void> {
    this.sort = value;
    this.reloadForm();
  }

  async updateFreshness(value: string[]): Promise<void> {
    this.freshness = value;
    this.reloadForm();
  }

  async updateAudience(value: string[]): Promise<void> {
    this.audience = value;
    this.reloadForm();
  }

  getSearchQueryMetadata(): JSONObject {
    return {
      searchMeta: {
        sort: this.sort,
        freshness: this.freshness,
        audience: this.audience,
      } satisfies PhoenixSearchMeta,
    };
  }

  override getSections() {
    return [
      Section(
        {
          id: "phoenix_filters",
          footer: "Phoenix ha un catalogo attivo e molto ampio: puoi isolare le serie aggiornate di recente e gestire separatamente i contenuti adulti.",
        },
        [
          SelectRow("freshness", {
            title: "Aggiornamento",
            value: this.freshness,
            options: [
              { id: "all", title: "Qualsiasi data" },
              { id: "fresh", title: "Aggiornati negli ultimi 120 giorni" },
              { id: "older", title: "Archivio meno recente" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as PhoenixSearchForm, "updateFreshness"),
          }),
          SelectRow("audience", {
            title: "Classificazione",
            value: this.audience,
            options: [
              { id: "all", title: "Tutti" },
              { id: "safe", title: "Non adulti" },
              { id: "adult", title: "Solo adulti" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as PhoenixSearchForm, "updateAudience"),
          }),
        ],
      ),
      Section("phoenix_sort", [
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
          onValueChange: Application.Selector(this as PhoenixSearchForm, "updateSort"),
        }),
      ]),
    ];
  }
}

class PhoenixSettingsForm extends Form {
  private status = "Pronto";

  constructor(private readonly source: FansubGeneral) {
    super();
  }

  async updateFresh(value: boolean): Promise<void> {
    Application.setState(value, SHOW_FRESH_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateCatalog(value: boolean): Promise<void> {
    Application.setState(value, SHOW_CATALOG_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateAdultSection(value: boolean): Promise<void> {
    Application.setState(value, SHOW_ADULT_SECTION_KEY);
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
    this.status = (await this.source.checkApi()) ? "Phoenix raggiungibile" : "Phoenix non raggiungibile";
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
          id: "phoenix_home",
          footer: "Le sezioni sono pensate per distinguere le nuove release dall'ampio catalogo storico di Phoenix Scans.",
        },
        [
          LabelRow("profile", { title: "Profilo", value: "Reader attivo + catalogo esteso" }),
          ToggleRow("fresh", {
            title: "Mostra serie calde",
            subtitle: "Aggiornate negli ultimi 120 giorni",
            value: readBool(SHOW_FRESH_KEY, true),
            onValueChange: Application.Selector(this as PhoenixSettingsForm, "updateFresh"),
          }),
          ToggleRow("catalog", {
            title: "Mostra catalogo completo",
            value: readBool(SHOW_CATALOG_KEY, true),
            onValueChange: Application.Selector(this as PhoenixSettingsForm, "updateCatalog"),
          }),
          ToggleRow("adult_section", {
            title: "Mostra sezione 18+ separata",
            subtitle: "Visibile solo quando i contenuti adulti non sono nascosti",
            value: readBool(SHOW_ADULT_SECTION_KEY, false),
            onValueChange: Application.Selector(this as PhoenixSettingsForm, "updateAdultSection"),
          }),
        ],
      ),
      Section(
        { id: "phoenix_content", footer: "Il filtro viene applicato a Home e ricerca." },
        [
          ToggleRow("hide_adult", {
            title: "Nascondi contenuti per adulti",
            value: readBool(HIDE_ADULT_KEY, false),
            onValueChange: Application.Selector(this as PhoenixSettingsForm, "updateAdult"),
          }),
        ],
      ),
      Section(
        { id: "phoenix_maintenance", footer: "Svuota la cache se il sito è stato appena aggiornato e i dati sembrano vecchi." },
        [
          LabelRow("status", { title: "Stato Phoenix", value: this.status }),
          ButtonRow("test", {
            title: "Verifica Phoenix Scans",
            onSelect: Application.Selector(this as PhoenixSettingsForm, "testConnection"),
          }),
          ButtonRow("clear", {
            title: "Svuota cache Phoenix",
            onSelect: Application.Selector(this as PhoenixSettingsForm, "clearCache"),
          }),
        ],
      ),
    ];
  }
}

class PhoenixScansExtension extends FansubGeneral {
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
    return new PhoenixSettingsForm(this);
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = (query.metadata as { searchMeta?: PhoenixSearchMeta } | undefined)?.searchMeta;
    return new PhoenixSearchForm(meta);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [
      {
        id: "phoenix_latest",
        title: "Ultime uscite",
        subtitle: "I capitoli più recenti di Phoenix Scans",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
    if (readBool(SHOW_FRESH_KEY, true)) {
      sections.push({
        id: "phoenix_fresh",
        title: "Serie calde",
        subtitle: "Aggiornate negli ultimi 120 giorni",
        type: DiscoverSectionType.featured,
      });
    }
    if (readBool(SHOW_CATALOG_KEY, true)) {
      sections.push({
        id: "phoenix_catalog",
        title: "Catalogo Phoenix",
        subtitle: "Tutte le serie in ordine alfabetico",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if (!this.getHideAdult() && readBool(SHOW_ADULT_SECTION_KEY, false)) {
      sections.push({
        id: "phoenix_adult",
        title: "Contenuti 18+",
        subtitle: "Serie marcate come adulte dal reader",
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
    if (section.id === "phoenix_latest") {
      return {
        items: this.sortCatalog(catalog, "recent")
          .slice(0, 24)
          .map((comic) => this.toChapterUpdateItem(comic))
          .filter((item): item is DiscoverSectionItem => item !== undefined),
      };
    }
    if (section.id === "phoenix_fresh") {
      return {
        items: this.sortCatalog(
          catalog.filter((comic) => this.updatedWithin(comic, FRESH_DAYS)),
          "recent",
        ).map((comic) => this.toFeaturedItem(comic, "Serie aggiornata")),
      };
    }
    if (section.id === "phoenix_adult") {
      return {
        items: this.sortCatalog(
          catalog.filter((comic) => comic.adult === 1),
          "recent",
        ).map((comic) => this.toSimpleItem(comic)),
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
    const meta = (query.metadata as { searchMeta?: PhoenixSearchMeta } | undefined)?.searchMeta;
    const freshness = meta?.freshness?.[0] ?? "all";
    const audience = meta?.audience?.[0] ?? "all";
    const sort = (meta?.sort?.[0] ?? "recent") as CatalogSort;
    let comics = await this.loadSearchComics(query);
    if (freshness === "fresh") comics = comics.filter((comic) => this.updatedWithin(comic, FRESH_DAYS));
    if (freshness === "older") comics = comics.filter((comic) => !this.updatedWithin(comic, FRESH_DAYS));
    if (audience === "safe") comics = comics.filter((comic) => comic.adult !== 1);
    if (audience === "adult") comics = comics.filter((comic) => comic.adult === 1);
    return { items: this.sortCatalog(comics, sort).map((comic) => this.toSearchResult(comic)) };
  }
}

export const PhoenixScans = new PhoenixScansExtension();
