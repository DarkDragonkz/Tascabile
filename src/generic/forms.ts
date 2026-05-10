/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { Form, Section, ToggleRow, NavigationRow, SelectRow } from "@paperback/types";

import { filter } from "./utils";

class HomeSettings extends Form {
  public async updateToggleValue(value: boolean, key: string): Promise<void> {
    Application.setState(value, key);
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }

  override getSections() {
    return [
      Section(
        {
          id: "home_settings",
          footer: "Mostra/Nascondi le sezioni nella Home",
        },
        [
          ToggleRow("popular_section_enabled", {
            title: "Abilita Popolari",
            value: (Application.getState("popular_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handlePopularStatusChange"),
          }),
          ToggleRow("mese_section_enabled", {
            title: "Abilita Tendenze del Mese",
            value: (Application.getState("mese_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleMeseStatusChange"),
          }),
          ToggleRow("most_read_section_enabled", {
            title: "Abilita Più Letti",
            value: (Application.getState("most_read_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleMostReadStatusChange"),
          }),
          ToggleRow("update_section_enabled", {
            title: "Abilita Aggiornati di Recente",
            value: (Application.getState("update_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleUpdateStatusChange"),
          }),
          ToggleRow("new_section_enabled", {
            title: "Abilita Ultime Aggiunte",
            value: (Application.getState("new_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleNewStatusChange"),
          }),
          ToggleRow("type_section_enabled", {
            title: "Abilita Tipologia",
            value: (Application.getState("type_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleTypeStatusChange"),
          }),
          ToggleRow("genre_section_enabled", {
            title: "Abilita Generi",
            value: (Application.getState("genre_section_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "handleGenreStatusChange"),
          }),
        ],
      ),
    ];
  }

  async handlePopularStatusChange(value: boolean): Promise<void> {
    await this.updateToggleValue(value, "popular_section_enabled");
  }

  async handleMeseStatusChange(value: boolean): Promise<void> {
    await this.updateToggleValue(value, "mese_section_enabled");
  }

  async handleMostReadStatusChange(value: boolean): Promise<void> {
    await this.updateToggleValue(value, "most_read_section_enabled");
  }

  async handleUpdateStatusChange(value: boolean): Promise<void> {
    await this.updateToggleValue(value, "update_section_enabled");
  }

  async handleNewStatusChange(value: boolean): Promise<void> {
    await this.updateToggleValue(value, "new_section_enabled");
  }

  async handleTypeStatusChange(value: boolean): Promise<void> {
    await this.updateToggleValue(value, "type_section_enabled");
  }

  async handleGenreStatusChange(value: boolean): Promise<void> {
    await this.updateToggleValue(value, "genre_section_enabled");
  }
}

class FilterSettings extends Form {
  private readonly genres = filter.getGenreFilter().map(({ value, ...rest }) => ({ title: value, ...rest }));
  private readonly mangaTypes = filter.getMangaTypeFilter().map(({ value, ...rest }) => ({ title: value, ...rest }));

  public async updateValue(value: string[], key: string): Promise<void> {
    Application.setState(value, key);
    this.reloadForm();
    Application.invalidateSearchFilters();
  }

  override getSections() {
    return [
      Section(
        {
          id: "filter_settings",
          footer: "Imposta filtri nascosti e tipologia predefinita",
        },
        [
          SelectRow("hide_tags", {
            title: "Nascondi Generi",
            subtitle: "Nascondi alcuni generi dai risultati",
            value: (Application.getState("hide_tags") as string[] | undefined) ?? [],
            options: this.genres,
            minItemCount: 0,
            maxItemCount: this.genres.length,
            onValueChange: Application.Selector(this as FilterSettings, "handleHideTagsStatusChange"),
          }),
          SelectRow("hide_type", {
            title: "Nascondi Tipologia",
            subtitle: "Nascondi alcune tipologie dai risultati",
            value: (Application.getState("hide_type") as string[] | undefined) ?? [],
            options: this.mangaTypes,
            minItemCount: 0,
            maxItemCount: this.mangaTypes.length,
            onValueChange: Application.Selector(this as FilterSettings, "handleHideTypeStatusChange"),
          }),
          SelectRow("def_type", {
            title: "Tipologia Default",
            subtitle: "Tipologia predefinita nella ricerca",
            value: (Application.getState("def_type") as string[] | undefined) ?? [],
            options: this.mangaTypes,
            minItemCount: 0,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as FilterSettings, "handleDefTypeStatusChange"),
          }),
        ],
      ),
    ];
  }

  async handleHideTagsStatusChange(value: string[]): Promise<void> {
    await this.updateValue(value, "hide_tags");
  }

  async handleHideTypeStatusChange(value: string[]): Promise<void> {
    await this.updateValue(value, "hide_type");
  }

  async handleDefTypeStatusChange(value: string[]): Promise<void> {
    await this.updateValue(value, "def_type");
  }
}

export class Forms extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "settings",
          footer: "Impostazioni MangaWorld",
        },
        [
          NavigationRow("home_settings", {
            title: "Home",
            subtitle: "Sezioni mostrate nella Home",
            form: new HomeSettings(),
          }),
          NavigationRow("filter_settings", {
            title: "Filtri",
            subtitle: "Generi e tipologie nascosti",
            form: new FilterSettings(),
          }),
        ],
      ),
    ];
  }
}
