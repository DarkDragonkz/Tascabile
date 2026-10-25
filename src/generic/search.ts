/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import {
  AdvancedSearchForm,
  Section,
  SelectRow,
  TriStateSelectRow,
  type SearchQuery,
  type Tag,
} from "@paperback/types";

import type { MangaWorldSearchMetadata, OptionItem } from "./models";
import { getDefaultType, isMigratedAdultGenreHidden } from "./preferences";
import { filter, tags, types } from "./utils";

function toTags(items: OptionItem[]): Tag[] {
  return items.map((item) => ({ id: item.id, title: item.value }));
}

export class MangaWorldAdvancedSearchForm extends AdvancedSearchForm {
  private genres: Record<string, "included" | "excluded">;
  private mangaTypes: Record<string, "included" | "excluded">;
  private status: string;
  private year: string;

  constructor(searchQuery: SearchQuery<MangaWorldSearchMetadata>) {
    super();
    const metadata = searchQuery.metadata ?? {};
    this.genres = { ...metadata.genres };
    this.mangaTypes = { ...metadata.types };
    this.status = metadata.status ?? "";
    this.year = metadata.year ?? "";

    if (Object.keys(this.mangaTypes).length === 0) {
      const defaultType = getDefaultType();
      if (defaultType && !types.blacklistedType(defaultType)) {
        this.mangaTypes[defaultType] = "included";
      }
    }
  }

  override getSections() {
    const genreOptions = toTags(
      filter
        .getGenreFilter()
        .filter((item) => !tags.blacklistedTags([item.id]))
        .filter((item) => !isMigratedAdultGenreHidden(item.id) && !isMigratedAdultGenreHidden(item.value)),
    );
    const typeOptions = toTags(
      filter.getMangaTypeFilter().filter((item) => !types.blacklistedType(item.id)),
    );
    const statusOptions = toTags(filter.getStatusFilter());
    const yearOptions = toTags(filter.getYearFilter());

    return [
      Section(
        {
          id: "genres",
          footer: "Tocca un genere per includerlo o escluderlo dalla ricerca.",
        },
        [
          TriStateSelectRow("genres", {
            title: "Generi",
            layout: "flow",
            value: this.genres,
            items: genreOptions,
            allowExclusion: true,
            allowEmptySelection: true,
            onValueChange: Application.Selector(
              this as MangaWorldAdvancedSearchForm,
              "handleGenresChange",
            ),
          }),
        ],
      ),
      Section(
        {
          id: "types",
          footer: "Puoi combinare più tipologie e anche escluderne alcune.",
        },
        [
          TriStateSelectRow("types", {
            title: "Tipologia",
            layout: "flow",
            value: this.mangaTypes,
            items: typeOptions,
            allowExclusion: true,
            allowEmptySelection: true,
            onValueChange: Application.Selector(
              this as MangaWorldAdvancedSearchForm,
              "handleTypesChange",
            ),
          }),
        ],
      ),
      Section("status", [
        SelectRow("status", {
          title: "Stato",
          value: this.status ? [this.status] : [],
          options: statusOptions,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector(
            this as MangaWorldAdvancedSearchForm,
            "handleStatusChange",
          ),
        }),
      ]),
      Section("year", [
        SelectRow("year", {
          title: "Anno",
          value: this.year ? [this.year] : [],
          options: yearOptions,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector(
            this as MangaWorldAdvancedSearchForm,
            "handleYearChange",
          ),
        }),
      ]),
    ];
  }

  async handleGenresChange(value: Record<string, "included" | "excluded">): Promise<void> {
    this.genres = value;
  }

  async handleTypesChange(value: Record<string, "included" | "excluded">): Promise<void> {
    this.mangaTypes = value;
  }

  async handleStatusChange(value: string[]): Promise<void> {
    this.status = value[0] ?? "";
  }

  async handleYearChange(value: string[]): Promise<void> {
    this.year = value[0] ?? "";
  }

  override getSearchQueryMetadata(): MangaWorldSearchMetadata {
    const result: MangaWorldSearchMetadata = {};
    if (Object.keys(this.genres).length > 0) result.genres = this.genres;
    if (Object.keys(this.mangaTypes).length > 0) result.types = this.mangaTypes;
    if (this.status) result.status = this.status;
    if (this.year) result.year = this.year;
    return result;
  }
}
