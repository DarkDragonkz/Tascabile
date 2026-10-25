import {
  ContentRating,
  SourceIntents,
  type ExtensionInfo,
  type SourceDeveloper,
} from "@paperback/types";

import { BADGES } from "../common/badges";

export const basePbConfig = {
  name: "",
  description: "",
  version: "1.2.6",
  icon: "icon.png",
  language: "it",
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
  ],
  badges: [BADGES.fansub, BADGES.italian],
  developers: [
    { name: "Catta1997", github: "https://github.com/Catta1997" },
    { name: "DarkDragonkz", github: "https://github.com/DarkDragonkz" },
  ] as SourceDeveloper[],
  contentRating: ContentRating.EVERYONE as ContentRating,
} satisfies ExtensionInfo;
