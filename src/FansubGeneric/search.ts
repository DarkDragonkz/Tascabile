import { AdvancedSearchForm, Section, SelectRow, type JSONObject } from "@paperback/types";

export interface FansubSearchMeta extends JSONObject {
  sort: string[];
}

const SORT_OPTIONS = [
  { id: "recent", title: "Più recenti" },
  { id: "title_asc", title: "Titolo A-Z" },
  { id: "title_desc", title: "Titolo Z-A" },
];

export class FansubSearchForm extends AdvancedSearchForm {
  private sort: string[];

  constructor(initialMeta?: FansubSearchMeta) {
    super();
    this.sort = initialMeta?.sort ?? ["recent"];
  }

  async updateSort(value: string[]): Promise<void> {
    this.sort = value;
    this.reloadForm();
  }

  getSearchQueryMetadata(): JSONObject {
    return { searchMeta: { sort: this.sort } satisfies FansubSearchMeta };
  }

  override getSections() {
    return [
      Section("ordinamento", [
        SelectRow("sort", {
          title: "Ordina risultati",
          value: this.sort,
          options: SORT_OPTIONS,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(this as FansubSearchForm, "updateSort"),
        }),
      ]),
    ];
  }
}
