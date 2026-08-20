/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import {
  ButtonRow,
  Form,
  LabelRow,
  NavigationRow,
  Section,
  SelectRow,
  ToggleRow,
} from "@paperback/types";

import type { MangaWorldGeneric } from "./main";
import { isMigratedAdultGenreHidden } from "./preferences";
import { filter, tags } from "./utils";

function optionList(items: { id: string; value: string }[]) {
  return items.map(({ id, value }) => ({ id, title: value }));
}

class HomeSettings extends Form {
  private readonly genres = optionList(
    filter
      .getGenreFilter()
      .filter((item) => !tags.blacklistedTags([item.id]))
      .filter((item) => !isMigratedAdultGenreHidden(item.id) && !isMigratedAdultGenreHidden(item.value)),
  );

  override getSections() {
    const favoritesEnabled = (Application.getState("fav_section_enabled") as boolean) ?? true;
    return [
      Section(
        {
          id: "home_primary",
          footer: "Le sezioni sono ordinate per dare priorità agli aggiornamenti e ai contenuti in tendenza.",
        },
        [
          ToggleRow("popular_section_enabled", {
            title: "In tendenza",
            subtitle: "Capitoli più letti in evidenza",
            value: (Application.getState("popular_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handlePopularChange"),
          }),
          ToggleRow("update_section_enabled", {
            title: "Aggiornati di recente",
            subtitle: "Ultimi capitoli pubblicati",
            value: (Application.getState("update_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleUpdatesChange"),
          }),
          ToggleRow("mese_section_enabled", {
            title: "Manga del mese",
            subtitle: "Classifica mensile di MangaWorld",
            value: (Application.getState("mese_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleMonthChange"),
          }),
          ToggleRow("new_section_enabled", {
            title: "Nuove aggiunte",
            value: (Application.getState("new_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleNewChange"),
          }),
          ToggleRow("most_read_section_enabled", {
            title: "Più letti",
            value: (Application.getState("most_read_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleMostReadChange"),
          }),
        ],
      ),
      Section(
        {
          id: "home_personal",
          footer: "La sezione personalizzata appare solo quando è selezionato almeno un genere.",
        },
        [
          ToggleRow("fav_section_enabled", {
            title: "Per te",
            subtitle: "Nuove aggiunte dei tuoi generi preferiti",
            value: favoritesEnabled,
            onValueChange: Application.Selector(this as HomeSettings, "handleFavoritesChange"),
          }),
          SelectRow("fav_tags_new", {
            title: "Generi preferiti",
            subtitle: "Seleziona fino a 8 generi",
            value: (Application.getState("fav_tags_new") as string[] | undefined) ?? [],
            options: this.genres,
            minItemCount: 0,
            maxItemCount: Math.min(8, this.genres.length),
            onValueChange: Application.Selector(this as HomeSettings, "handleFavoriteGenresChange"),
            isHidden: !favoritesEnabled,
          }),
        ],
      ),
      Section("home_explore", [
        ToggleRow("type_section_enabled", {
          title: "Esplora per tipologia",
          value: (Application.getState("type_section_enabled") as boolean) ?? true,
          onValueChange: Application.Selector(this as HomeSettings, "handleTypeChange"),
        }),
        ToggleRow("genre_section_enabled", {
          title: "Esplora per genere",
          value: (Application.getState("genre_section_enabled") as boolean) ?? true,
          onValueChange: Application.Selector(this as HomeSettings, "handleGenreChange"),
        }),
      ]),
    ];
  }

  private async updateToggle(value: boolean, key: string): Promise<void> {
    Application.setState(value, key);
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }

  async handlePopularChange(value: boolean): Promise<void> {
    await this.updateToggle(value, "popular_section_enabled");
  }

  async handleUpdatesChange(value: boolean): Promise<void> {
    await this.updateToggle(value, "update_section_enabled");
  }

  async handleMonthChange(value: boolean): Promise<void> {
    await this.updateToggle(value, "mese_section_enabled");
  }

  async handleNewChange(value: boolean): Promise<void> {
    await this.updateToggle(value, "new_section_enabled");
  }

  async handleMostReadChange(value: boolean): Promise<void> {
    await this.updateToggle(value, "most_read_section_enabled");
  }

  async handleFavoritesChange(value: boolean): Promise<void> {
    await this.updateToggle(value, "fav_section_enabled");
  }

  async handleFavoriteGenresChange(value: string[]): Promise<void> {
    Application.setState(value, "fav_tags_new");
    Application.invalidateDiscoverSections();
  }

  async handleTypeChange(value: boolean): Promise<void> {
    await this.updateToggle(value, "type_section_enabled");
  }

  async handleGenreChange(value: boolean): Promise<void> {
    await this.updateToggle(value, "genre_section_enabled");
  }
}

class SearchSettings extends Form {
  private readonly genres = optionList(
    filter
      .getGenreFilter()
      .filter((item) => !isMigratedAdultGenreHidden(item.id) && !isMigratedAdultGenreHidden(item.value)),
  );
  private readonly mangaTypes = optionList(filter.getMangaTypeFilter());

  override getSections() {
    return [
      Section(
        {
          id: "search_defaults",
          footer: "Queste preferenze vengono applicate alla ricerca avanzata nativa di Paperback 0.9.",
        },
        [
          SelectRow("def_type", {
            title: "Tipologia predefinita",
            value: (Application.getState("def_type") as string[] | undefined) ?? [],
            options: this.mangaTypes,
            minItemCount: 0,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as SearchSettings, "handleDefaultTypeChange"),
          }),
        ],
      ),
      Section(
        {
          id: "search_hidden",
          footer: "Gli elementi nascosti vengono rimossi sia dalla ricerca sia dalle sezioni di esplorazione.",
        },
        [
          SelectRow("hide_tags", {
            title: "Generi nascosti",
            value: (Application.getState("hide_tags") as string[] | undefined) ?? [],
            options: this.genres,
            minItemCount: 0,
            maxItemCount: this.genres.length,
            onValueChange: Application.Selector(this as SearchSettings, "handleHiddenGenresChange"),
          }),
          SelectRow("hide_type", {
            title: "Tipologie nascoste",
            value: (Application.getState("hide_type") as string[] | undefined) ?? [],
            options: this.mangaTypes,
            minItemCount: 0,
            maxItemCount: this.mangaTypes.length,
            onValueChange: Application.Selector(this as SearchSettings, "handleHiddenTypesChange"),
          }),
        ],
      ),
    ];
  }

  private async updateValue(value: string[], key: string): Promise<void> {
    Application.setState(value, key);
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }

  async handleDefaultTypeChange(value: string[]): Promise<void> {
    await this.updateValue(value, "def_type");
  }

  async handleHiddenGenresChange(value: string[]): Promise<void> {
    await this.updateValue(value, "hide_tags");
  }

  async handleHiddenTypesChange(value: string[]): Promise<void> {
    await this.updateValue(value, "hide_type");
  }
}

class ContentSettings extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "adult_migration",
          footer:
            "MangaWorld ha trasferito Doujinshi e contenuti +18 su MangaWorldAdult. L'opzione è attiva di default per evitare filtri e risultati non più affidabili sul sito classico.",
        },
        [
          ToggleRow("hide_migrated_adult_content", {
            title: "Nascondi contenuti +18 trasferiti",
            value: (Application.getState("hide_migrated_adult_content") as boolean) ?? true,
            onValueChange: Application.Selector(this as ContentSettings, "handleAdultContentChange"),
          }),
        ],
      ),
    ];
  }

  async handleAdultContentChange(value: boolean): Promise<void> {
    Application.setState(value, "hide_migrated_adult_content");
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }
}

class MaintenanceSettings extends Form {
  private status = "Cache pronta";

  constructor(private readonly source: MangaWorldGeneric) {
    super();
  }

  override getSections() {
    return [
      Section(
        {
          id: "maintenance",
          footer:
            "I filtri vengono memorizzati per 7 giorni. Le pagine più richieste usano una cache breve per evitare richieste duplicate.",
        },
        [
          LabelRow("status", {
            title: "Stato",
            value: this.status,
          }),
          ButtonRow("test_site", {
            title: "Verifica connessione a MangaWorld",
            onSelect: Application.Selector(this as MaintenanceSettings, "testSite"),
          }),
          ButtonRow("refresh_filters", {
            title: "Aggiorna filtri adesso",
            onSelect: Application.Selector(this as MaintenanceSettings, "refreshFilters"),
          }),
          ButtonRow("clear_network_cache", {
            title: "Svuota cache di rete",
            onSelect: Application.Selector(this as MaintenanceSettings, "clearNetworkCache"),
          }),
        ],
      ),
    ];
  }

  async testSite(): Promise<void> {
    this.status = "Verifica in corso...";
    this.reloadForm();
    try {
      this.source.requestManager.clearCache();
      const html = await this.source.requestManager.fetchText(this.source.base_url, 0);
      this.status = html.length > 1000 ? "MangaWorld raggiungibile" : "Risposta inattesa dal sito";
    } catch {
      this.status = "MangaWorld non raggiungibile";
    }
    this.reloadForm();
  }

  async refreshFilters(): Promise<void> {
    this.status = "Aggiornamento filtri...";
    this.reloadForm();
    this.source.requestManager.clearCache();
    await filter.populateFilter(this.source, true);
    this.status = "Filtri aggiornati";
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }

  async clearNetworkCache(): Promise<void> {
    this.source.requestManager.clearCache();
    this.status = "Cache di rete svuotata";
    this.reloadForm();
  }
}

export class Forms extends Form {
  constructor(private readonly source: MangaWorldGeneric) {
    super();
  }

  override getSections() {
    return [
      Section(
        {
          id: "overview",
          footer: "MangaWorld ottimizzato per Paperback 0.9.",
        },
        [
          LabelRow("engine", {
            title: "Motore ricerca",
            value: "AdvancedSearchForm nativo 0.9",
          }),
          NavigationRow("home_settings", {
            title: "Home",
            subtitle: "Sezioni, ordine logico e contenuti preferiti",
            form: new HomeSettings(),
          }),
          NavigationRow("search_settings", {
            title: "Ricerca",
            subtitle: "Filtri, tipologia predefinita e contenuti nascosti",
            form: new SearchSettings(),
          }),
          NavigationRow("content_settings", {
            title: "Contenuti",
            subtitle: "Gestione dei contenuti trasferiti su MangaWorldAdult",
            form: new ContentSettings(),
          }),
          NavigationRow("maintenance_settings", {
            title: "Manutenzione",
            subtitle: "Cache e aggiornamento filtri",
            form: new MaintenanceSettings(this.source),
          }),
        ],
      ),
    ];
  }
}
