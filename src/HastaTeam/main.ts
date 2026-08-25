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

const DOMAIN = "https://reader.hastateam.com/api";
const SHOW_CURRENT_KEY = "hasta.ui.showCurrent";
const SHOW_ARCHIVE_KEY = "hasta.ui.showArchive";
const HIDE_ADULT_KEY = "hasta.ui.hideAdult";
const CURRENT_DAYS = 1_095;

function readBool(key: string, fallback: boolean): boolean {
  const value = Application.getState(key);
  return typeof value === "boolean" ? value : fallback;
}

interface HastaSearchMeta extends JSONObject {
  sort: string[];
  activity: string[];
  audience: string[];
}

class HastaSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private activity: string[];
  private audience: string[];

  constructor(meta?: HastaSearchMeta) {
    super();
    this.sort = meta?.sort ?? ["recent"];
    this.activity = meta?.activity ?? ["all"];
    this.audience = meta?.audience ?? ["all"];
  }

  async updateSort(value: string[]): Promise<void> {
    this.sort = value;
    this.reloadForm();
  }

  async updateActivity(value: string[]): Promise<void> {
    this.activity = value;
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
        activity: this.activity,
        audience: this.audience,
      } satisfies HastaSearchMeta,
    };
  }

  override getSections() {
    return [
      Section(
        {
          id: "hasta_activity",
          footer: "Hasta Team ha un catalogo storico molto ampio: il filtro attività separa i progetti aggiornati negli ultimi tre anni dall'archivio.",
        },
        [
          SelectRow("activity", {
            title: "Attività",
            value: this.activity,
            options: [
              { id: "all", title: "Tutto il catalogo" },
              { id: "current", title: "Aggiornati negli ultimi 3 anni" },
              { id: "archive", title: "Archivio storico" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as HastaSearchForm, "updateActivity"),
          }),
          SelectRow("audience", {
            title: "Contenuti",
            value: this.audience,
            options: [
              { id: "all", title: "Tutti" },
              { id: "safe", title: "Non adulti" },
              { id: "adult", title: "Solo adulti" },
            ],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as HastaSearchForm, "updateAudience"),
          }),
        ],
      ),
      Section("hasta_sort", [
        SelectRow("sort", {
          title: "Ordina",
          value: this.sort,
          options: [
            { id: "recent", title: "Più recenti" },
            { id: "title_asc", title: "Titolo A-Z" },
            { id: "title_desc", title: "Titolo Z-A" },
            { id: "author", title: "Autore A-Z" },
          ],
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(this as HastaSearchForm, "updateSort"),
        }),
      ]),
    ];
  }
}

class HastaSettingsForm extends Form {
  private status = "Pronto";

  constructor(private readonly source: FansubGeneral) {
    super();
  }

  async updateCurrent(value: boolean): Promise<void> {
    Application.setState(value, SHOW_CURRENT_KEY);
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
    this.status = (await this.source.checkApi()) ? "Reader raggiungibile" : "Reader non raggiungibile";
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
          id: "hasta_home",
          footer: "La Home distingue le uscite effettivamente recenti dal grande catalogo storico di Hasta Team.",
        },
        [
          LabelRow("profile", { title: "Profilo", value: "Catalogo storico + progetti attivi" }),
          ToggleRow("current", {
            title: "Mostra progetti recenti",
            subtitle: "Serie aggiornate negli ultimi tre anni",
            value: readBool(SHOW_CURRENT_KEY, true),
            onValueChange: Application.Selector(this as HastaSettingsForm, "updateCurrent"),
          }),
          ToggleRow("archive", {
            title: "Mostra archivio completo",
            subtitle: "Tutte le serie ordinate alfabeticamente",
            value: readBool(SHOW_ARCHIVE_KEY, true),
            onValueChange: Application.Selector(this as HastaSettingsForm, "updateArchive"),
          }),
        ],
      ),
      Section("hasta_content", [
        ToggleRow("hide_adult", {
          title: "Nascondi contenuti per adulti",
          value: readBool(HIDE_ADULT_KEY, false),
          onValueChange: Application.Selector(this as HastaSettingsForm, "updateAdult"),
        }),
      ]),
      Section(
        { id: "hasta_maintenance", footer: "Usa la verifica solo se il reader non restituisce risultati." },
        [
          LabelRow("status", { title: "Stato Hasta Reader", value: this.status }),
          ButtonRow("test", {
            title: "Verifica Hasta Reader",
            onSelect: Application.Selector(this as HastaSettingsForm, "testConnection"),
          }),
          ButtonRow("clear", {
            title: "Svuota cache Hasta",
            onSelect: Application.Selector(this as HastaSettingsForm, "clearCache"),
          }),
        ],
      ),
    ];
  }
}

class HastaTeamExtension extends FansubGeneral {
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
    return new HastaSettingsForm(this);
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = (query.metadata as { searchMeta?: HastaSearchMeta } | undefined)?.searchMeta;
    return new HastaSearchForm(meta);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [
      {
        id: "hasta_latest",
        title: "Ultime uscite",
        subtitle: "Gli ultimi capitoli pubblicati da Hasta Team",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
    if (readBool(SHOW_CURRENT_KEY, true)) {
      sections.push({
        id: "hasta_current",
        title: "Progetti recenti",
        subtitle: "Serie aggiornate negli ultimi tre anni",
        type: DiscoverSectionType.featured,
      });
    }
    if (readBool(SHOW_ARCHIVE_KEY, true)) {
      sections.push({
        id: "hasta_archive",
        title: "Archivio Hasta",
        subtitle: "Il catalogo storico completo",
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
    if (section.id === "hasta_latest") {
      return {
        items: this.sortCatalog(catalog, "recent")
          .slice(0, 24)
          .map((comic) => this.toChapterUpdateItem(comic))
          .filter((item): item is DiscoverSectionItem => item !== undefined),
      };
    }
    if (section.id === "hasta_current") {
      return {
        items: this.sortCatalog(
          catalog.filter((comic) => this.updatedWithin(comic, CURRENT_DAYS)),
          "recent",
        ).map((comic) => this.toFeaturedItem(comic, "Progetto recente")),
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
    const meta = (query.metadata as { searchMeta?: HastaSearchMeta } | undefined)?.searchMeta;
    const activity = meta?.activity?.[0] ?? "all";
    const audience = meta?.audience?.[0] ?? "all";
    const sort = (meta?.sort?.[0] ?? "recent") as CatalogSort;
    let comics = await this.loadSearchComics(query);
    if (activity === "current") comics = comics.filter((comic) => this.updatedWithin(comic, CURRENT_DAYS));
    if (activity === "archive") comics = comics.filter((comic) => !this.updatedWithin(comic, CURRENT_DAYS));
    if (audience === "safe") comics = comics.filter((comic) => comic.adult !== 1);
    if (audience === "adult") comics = comics.filter((comic) => comic.adult === 1);
    return { items: this.sortCatalog(comics, sort).map((comic) => this.toSearchResult(comic)) };
  }
}

export const HastaTeam = new HastaTeamExtension();
