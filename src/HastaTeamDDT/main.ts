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

const DOMAIN = "https://ddt.hastateam.com/api";
const SHOW_LIBRARY_KEY = "ddt.ui.showLibrary";
const HIDE_ADULT_KEY = "ddt.ui.hideAdult";
const RECENT_DAYS = 730;

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

interface DdtSearchMeta extends JSONObject {
  sort: string[];
  period: string[];
}

class DdtSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private period: string[];

  constructor(meta?: DdtSearchMeta) {
    super();
    this.sort = meta?.sort ?? ["title_asc"];
    this.period = meta?.period ?? ["all"];
  }

  async updateSort(value: string[]): Promise<void> {
    this.sort = value;
    this.reloadForm();
  }

  async updatePeriod(value: string[]): Promise<void> {
    this.period = value;
    this.reloadForm();
  }

  getSearchQueryMetadata(): JSONObject {
    return { searchMeta: { sort: this.sort, period: this.period } satisfies DdtSearchMeta };
  }

  override getSections() {
    return [
      Section(
        {
          id: "ddt_period",
          footer: "DDT è soprattutto un archivio di volumi: puoi restringere la ricerca ai caricamenti più recenti oppure esplorare tutto il fondo storico.",
        },
        [
          SelectRow("period", {
            title: "Archivio",
            value: this.period,
            options: [
              { id: "all", title: "Tutti i volumi" },
              { id: "recent", title: "Aggiornati negli ultimi 2 anni" },
              { id: "historical", title: "Archivio precedente" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as DdtSearchForm, "updatePeriod"),
          }),
          SelectRow("sort", {
            title: "Ordina",
            value: this.sort,
            options: [
              { id: "title_asc", title: "Titolo A-Z" },
              { id: "recent", title: "Caricamenti più recenti" },
              { id: "title_desc", title: "Titolo Z-A" },
              { id: "author", title: "Autore A-Z" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as DdtSearchForm, "updateSort"),
          }),
        ],
      ),
    ];
  }
}

class DdtSettingsForm extends Form {
  private status = "Pronto";

  constructor(private readonly source: FansubGeneral) {
    super();
  }

  async updateLibrary(value: boolean): Promise<void> {
    Application.setState(value, SHOW_LIBRARY_KEY);
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
    this.status = (await this.source.checkApi()) ? "DDT Reader raggiungibile" : "DDT Reader non raggiungibile";
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
          id: "ddt_profile",
          footer: "Il reader DDT è pensato come archivio di progetti storici e volumi completi.",
        },
        [
          LabelRow("profile", { title: "Modalità", value: "Archivio DDT" }),
          LabelRow("quality", { title: "Immagini del reader", value: "fino a 1200 px di altezza" }),
          ToggleRow("library", {
            title: "Mostra biblioteca completa",
            subtitle: "Catalogo alfabetico di tutti i progetti DDT",
            value: readBool(SHOW_LIBRARY_KEY, true),
            onValueChange: Application.Selector(this as DdtSettingsForm, "updateLibrary"),
          }),
        ],
      ),
      Section("ddt_content", [
        ToggleRow("hide_adult", {
          title: "Nascondi eventuali contenuti per adulti",
          value: readBool(HIDE_ADULT_KEY, false),
          onValueChange: Application.Selector(this as DdtSettingsForm, "updateAdult"),
        }),
      ]),
      Section(
        { id: "ddt_maintenance", footer: "La qualità massima originale resta quella offerta dal sito DDT." },
        [
          LabelRow("status", { title: "Stato DDT Reader", value: this.status }),
          ButtonRow("test", {
            title: "Verifica DDT Reader",
            onSelect: Application.Selector(this as DdtSettingsForm, "testConnection"),
          }),
          ButtonRow("clear", {
            title: "Svuota cache DDT",
            onSelect: Application.Selector(this as DdtSettingsForm, "clearCache"),
          }),
        ],
      ),
    ];
  }
}

class HastaTeamDDTExtension extends FansubGeneral {
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
    return new DdtSettingsForm(this);
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = (query.metadata as { searchMeta?: DdtSearchMeta } | undefined)?.searchMeta;
    return new DdtSearchForm(meta);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [
      {
        id: "ddt_recent",
        title: "Volumi DDT recenti",
        subtitle: "Gli ultimi caricamenti dell'archivio",
        type: DiscoverSectionType.featured,
      },
    ];
    if (readBool(SHOW_LIBRARY_KEY, true)) {
      sections.push({
        id: "ddt_library",
        title: "Biblioteca DDT",
        subtitle: "Tutti i progetti in ordine alfabetico",
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
    if (section.id === "ddt_recent") {
      return {
        items: this.sortCatalog(catalog, "recent")
          .slice(0, 18)
          .map((comic) => this.toFeaturedItem(comic, "Archivio DDT")),
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
    const meta = (query.metadata as { searchMeta?: DdtSearchMeta } | undefined)?.searchMeta;
    const period = meta?.period?.[0] ?? "all";
    const sort = (meta?.sort?.[0] ?? "title_asc") as CatalogSort;
    let comics = await this.loadSearchComics(query);
    if (period === "recent") comics = comics.filter((comic) => this.updatedWithin(comic, RECENT_DAYS));
    if (period === "historical") comics = comics.filter((comic) => !this.updatedWithin(comic, RECENT_DAYS));
    return { items: this.sortCatalog(comics, sort).map((comic) => this.toSearchResult(comic)) };
  }
}

export const HastaTeamDDT = new HastaTeamDDTExtension();
