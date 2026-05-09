import type { ExtensionInfo } from "@paperback/types";
import { ContentRating, SourceIntents } from "@paperback/types";

export default {
  name: "MangaWorld",
  description: "Source italiana per MangaWorld.",
  version: "1.0.0-alpha.1",
  icon: "icon.png",
  language: "it",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
  ],
  badges: [
    { label: "Italiano" },
  ],
  developers: [
    {
      name: "DarkDragonkz",
      github: "https://github.com/DarkDragonkz",
    },
  ],
} satisfies ExtensionInfo;
