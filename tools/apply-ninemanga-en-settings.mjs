#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const mainPath = "src/NineManga/main.ts";
let main = readFileSync(mainPath, "utf8");

if (!main.includes("const LANGUAGE_STATE_KEY = \"ninemanga_language\";")) {
  main = main.replace(
    "import {\n  ContentRating,\n  DiscoverSectionType,\n  PaperbackInterceptor,",
    "import {\n  ContentRating,\n  DiscoverSectionType,\n  Form,\n  PaperbackInterceptor,\n  Section,\n  SelectRow,",
  );

  main = main.replace(
    "  type SearchResultItem,\n  type SearchResultsProviding,\n  type SourceManga,",
    "  type SearchResultItem,\n  type SearchResultsProviding,\n  type SettingsFormProviding,\n  type SourceManga,",
  );

  main = main.replace(
    "import { getNineMangaReaderParser } from \"./parsers\";\n\nconst DEFAULT_LANGUAGE = \"ita\";",
    "import { getNineMangaReaderParser } from \"./parsers\";\n\nconst LANGUAGE_STATE_KEY = \"ninemanga_language\";\nconst DEFAULT_LANGUAGE = \"ita\";",
  );

  const formBlock = `
class NineMangaSettingsForm extends Form {
  override getSections() {
    const selectedSite = getSelectedSite();
    const labels = getSelectedLabels();

    return [
      Section(
        {
          id: "ninemanga_language_settings",
          footer: labels.settingsFooter,
        },
        [
          SelectRow("ninemanga_language", {
            title: labels.languageSettingTitle,
            subtitle: labels.selectedLanguage + ": " + selectedSite.title,
            value: [getSelectedLanguage()],
            options: Object.entries(NINEMANGA_SITES).map(([id, site]) => ({ id, title: site.title })),
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as NineMangaSettingsForm, "handleLanguageChange"),
          }),
        ],
      ),
    ];
  }

  async handleLanguageChange(value: string[]): Promise<void> {
    Application.setState(value[0] ?? DEFAULT_LANGUAGE, LANGUAGE_STATE_KEY);
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }
}
`;

  main = main.replace(
    "type FetchedHtml = {\n  url: string;\n  html: string;\n};\n\nclass NineMangaInterceptor",
    "type FetchedHtml = {\n  url: string;\n  html: string;\n};\n" + formBlock + "\nclass NineMangaInterceptor",
  );

  main = main.replace(
    "    ChapterProviding,\n    DiscoverSectionProviding\n{",
    "    ChapterProviding,\n    DiscoverSectionProviding,\n    SettingsFormProviding\n{",
  );

  main = main.replace(
    "  async initialise(): Promise<void> {\n    this.requestManager.registerInterceptor();\n  }\n\n\n  async getDiscoverSections",
    "  async initialise(): Promise<void> {\n    this.requestManager.registerInterceptor();\n  }\n\n  async getSettingsForm(): Promise<Form> {\n    return new NineMangaSettingsForm();\n  }\n\n  async getDiscoverSections",
  );
}

const sitesStart = main.indexOf("const NINEMANGA_SITES = {");
const labelsStart = main.indexOf("const NINEMANGA_LABELS = {");
if (sitesStart === -1 || labelsStart === -1) throw new Error("NineManga site/label anchors not found");

const sitesBlock = `const NINEMANGA_SITES = {
  ita: { title: "Italiano", baseUrl: "https://it.ninemanga.com", languageCode: "it" },
  eng: { title: "English", baseUrl: "https://www.ninemanga.com", languageCode: "en" },
} as const;

`;
main = main.slice(0, sitesStart) + sitesBlock + main.slice(labelsStart);

const typeStart = main.indexOf("type NineMangaLanguage = keyof typeof NINEMANGA_SITES;");
if (typeStart === -1) throw new Error("NineManga language type anchor not found");

const labelsBlock = `const NINEMANGA_LABELS = {
  ita: {
    updated: "Ultimi aggiornamenti",
    popular: "Più popolari",
    newest: "Nuove serie",
    languageSettingTitle: "Lingua NineManga",
    selectedLanguage: "Selezionata",
    settingsFooter: "Seleziona il dominio NineManga usato da home, ricerca, dettagli e lettura.",
  },
  eng: {
    updated: "Latest Updates",
    popular: "Popular Series",
    newest: "New Series",
    languageSettingTitle: "NineManga Language",
    selectedLanguage: "Selected",
    settingsFooter: "Choose the NineManga domain used for home, search, details, and reading. English chapters may require a valid Cloudflare cf_clearance session.",
  },
} as const;

`;
main = main.slice(0, main.indexOf("const NINEMANGA_LABELS = {")) + labelsBlock + main.slice(typeStart);

main = main.replace(
  "function getSelectedLanguage(): NineMangaLanguage {\n  return DEFAULT_LANGUAGE;\n}",
  "function getSelectedLanguage(): NineMangaLanguage {\n  const stored = Application.getState(LANGUAGE_STATE_KEY) as string | undefined;\n  return isNineMangaLanguage(stored) ? stored : DEFAULT_LANGUAGE;\n}",
);

writeFileSync(mainPath, main);

const configPath = "src/NineManga/pbconfig.ts";
let config = readFileSync(configPath, "utf8");
config = config.replace(
  "pbConfig.description = \"Extension that pulls Italian manga content from NineManga.\";",
  "pbConfig.description = \"Extension that pulls Italian and English manga content from NineManga.\";",
);
config = config.replace(/pbConfig\.version = \"[^\"]+\";/u, "pbConfig.version = \"1.0.0-alpha.37\";");
if (!config.includes("SourceIntents.SETTINGS_FORM_PROVIDING")) {
  config = config.replace(
    "  SourceIntents.SEARCH_RESULT_PROVIDING,\n] as unknown as typeof pbConfig.capabilities;",
    "  SourceIntents.SEARCH_RESULT_PROVIDING,\n  SourceIntents.SETTINGS_FORM_PROVIDING,\n] as unknown as typeof pbConfig.capabilities;",
  );
}
writeFileSync(configPath, config);

console.log("Applied NineManga IT/EN settings support.");
