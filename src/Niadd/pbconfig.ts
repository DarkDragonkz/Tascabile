import {
  ContentRating,
  SourceIntents,
  type ExtensionInfo,
  type SourceDeveloper,
} from "@paperback/types";

export default {
  name: "Niadd",
  description:
    "Manga da Niadd, stesso catalogo e reader della storica NineManga: italiano (predefinito), portoghese, francese e russo, selezionabili nelle impostazioni.",
  version: "1.1.0",
  icon: "icon.png",
  language: "it",
  contentRating: ContentRating.EVERYONE as ContentRating,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [
    {
      label: "Italiano 🇮🇹",
      textColor: "#ffffff",
      backgroundColor: "#28eac2",
    },
    {
      label: "Multilingua",
      textColor: "#ffffff",
      backgroundColor: "#5965f2",
    },
  ],
  developers: [
    { name: "DarkDragonkz", github: "https://github.com/DarkDragonkz" },
  ] as SourceDeveloper[],
} satisfies ExtensionInfo;
