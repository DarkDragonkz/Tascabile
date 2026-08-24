import { ButtonRow, Form, LabelRow, NavigationRow, Section, ToggleRow } from "@paperback/types";

import FansubGeneral from "./main";

class HomeSettings extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "home_sections",
          footer: "Personalizza le sezioni mostrate nella pagina principale della fonte.",
        },
        [
          ToggleRow("fansub_featured_enabled", {
            title: "In evidenza",
            subtitle: "Titoli aggiornati di recente in formato grande",
            value: (Application.getState("fansub_featured_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "updateFeatured"),
          }),
          ToggleRow("fansub_recent_enabled", {
            title: "Aggiornati di recente",
            subtitle: "Ultimi capitoli pubblicati",
            value: (Application.getState("fansub_recent_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "updateRecent"),
          }),
          ToggleRow("fansub_catalog_enabled", {
            title: "Catalogo",
            subtitle: "Tutte le serie in ordine alfabetico",
            value: (Application.getState("fansub_catalog_enabled") as boolean) ?? true,
            onValueChange: Application.Selector(this as HomeSettings, "updateCatalog"),
          }),
        ],
      ),
    ];
  }

  private update(value: boolean, key: string): void {
    Application.setState(value, key);
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }

  async updateFeatured(value: boolean): Promise<void> {
    this.update(value, "fansub_featured_enabled");
  }

  async updateRecent(value: boolean): Promise<void> {
    this.update(value, "fansub_recent_enabled");
  }

  async updateCatalog(value: boolean): Promise<void> {
    this.update(value, "fansub_catalog_enabled");
  }
}

class ContentSettings extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "content",
          footer: "Il filtro viene applicato a Home e ricerca senza modificare i contenuti del sito.",
        },
        [
          ToggleRow("fansub_hide_adult", {
            title: "Nascondi contenuti per adulti",
            value: (Application.getState("fansub_hide_adult") as boolean) ?? false,
            onValueChange: Application.Selector(this as ContentSettings, "updateAdult"),
          }),
        ],
      ),
    ];
  }

  async updateAdult(value: boolean): Promise<void> {
    Application.setState(value, "fansub_hide_adult");
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }
}

class MaintenanceSettings extends Form {
  private status = "Pronta";

  constructor(private readonly source: FansubGeneral) {
    super();
  }

  override getSections() {
    return [
      Section(
        {
          id: "maintenance",
          footer: "Le risposte API vengono memorizzate per pochi minuti per evitare richieste duplicate.",
        },
        [
          LabelRow("status", { title: "Stato API", value: this.status }),
          ButtonRow("test", {
            title: "Verifica connessione",
            onSelect: Application.Selector(this as MaintenanceSettings, "testConnection"),
          }),
          ButtonRow("clear", {
            title: "Svuota cache di rete",
            onSelect: Application.Selector(this as MaintenanceSettings, "clearCache"),
          }),
        ],
      ),
    ];
  }

  async testConnection(): Promise<void> {
    this.status = "Verifica in corso...";
    this.reloadForm();
    try {
      this.source.requestManager.clearCache();
      const raw = await this.source.requestManager.apiMangaDetails("", true);
      this.status = raw.length > 10 ? "API raggiungibile" : "Risposta inattesa";
    } catch {
      this.status = "API non raggiungibile";
    }
    this.reloadForm();
  }

  async clearCache(): Promise<void> {
    this.source.requestManager.clearCache();
    this.status = "Cache svuotata";
    this.reloadForm();
  }
}

export class FansubSettingsForm extends Form {
  constructor(private readonly source: FansubGeneral) {
    super();
  }

  override getSections() {
    return [
      Section(
        {
          id: "overview",
          footer: "Interfaccia ottimizzata per Paperback 0.9.",
        },
        [
          LabelRow("source", { title: "Fonte", value: this.source.name }),
          LabelRow("language", { title: "Lingua", value: "Italiano 🇮🇹" }),
          NavigationRow("home", {
            title: "Home",
            subtitle: "In evidenza, aggiornamenti e catalogo",
            form: new HomeSettings(),
          }),
          NavigationRow("content", {
            title: "Contenuti",
            subtitle: "Filtri di visualizzazione",
            form: new ContentSettings(),
          }),
          NavigationRow("maintenance", {
            title: "Manutenzione",
            subtitle: "Stato API e cache",
            form: new MaintenanceSettings(this.source),
          }),
        ],
      ),
    ];
  }
}
