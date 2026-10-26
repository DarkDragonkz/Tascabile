import {
  ContentRating,
  SourceIntents,
  type ExtensionInfo,
  type SourceDeveloper,
} from "@paperback/types";

import { BADGES } from "../common/badges";

export default {
  name: "Juin Jutsu Team",
  description:
    "Scanlation italiane del Juin Jutsu Team (One Piece, Black Clover, Ichi the Witch e altre): ultimi capitoli, serie in corso e catalogo completo.",
  version: "1.0.0",
  icon: "icon.png",
  language: "it",
  contentRating: ContentRating.EVERYONE as ContentRating,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
  ],
  badges: [BADGES.fansub, BADGES.italian],
  developers: [
    { name: "DarkDragonkz", github: "https://github.com/DarkDragonkz" },
  ] as SourceDeveloper[],
} satisfies ExtensionInfo;
