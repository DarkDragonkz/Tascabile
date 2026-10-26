import {
  ContentRating,
  SourceIntents,
  type ExtensionInfo,
  type SourceDeveloper,
} from "@paperback/types";

import { BADGES } from "../common/badges";

export default {
  name: "Niadd",
  description:
    "Manga da Niadd, stesso catalogo e reader della storica NineManga: italiano (predefinito), portoghese, francese e russo, selezionabili nelle impostazioni.",
  version: "1.1.2",
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
  badges: [BADGES.manga, BADGES.italian, BADGES.multilingual],
  developers: [
    { name: "DarkDragonkz", github: "https://github.com/DarkDragonkz" },
  ] as SourceDeveloper[],
} satisfies ExtensionInfo;
