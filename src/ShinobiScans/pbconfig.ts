import {
  ContentRating,
  SourceIntents,
  type ExtensionInfo,
  type SourceDeveloper,
} from "@paperback/types";

import { BADGES } from "../common/badges";

export default {
  name: "Shinobi Scans",
  description:
    "Scanlation italiane di Shinobi Scans, soprattutto manhwa e webtoon (Overgeared, The Return of the Disaster-Class Hero): ultimi capitoli, più letti, nuove serie e ricerca per genere.",
  version: "1.0.1",
  icon: "icon.png",
  language: "it",
  contentRating: ContentRating.EVERYONE as ContentRating,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
  ],
  badges: [BADGES.fansub, BADGES.italian],
  developers: [
    { name: "DarkDragonkz", github: "https://github.com/DarkDragonkz" },
  ] as SourceDeveloper[],
} satisfies ExtensionInfo;
