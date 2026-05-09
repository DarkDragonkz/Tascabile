import type { ExtensionInfo } from "@paperback/types";
import { ContentRating, SourceIntents } from "@paperback/types";

export default {
  name: "ReadAllComics",
  description: "Comic source for ReadAllComics.",
  version: "1.0.0-alpha.1",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.MATURE,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
  ],
  badges: [
    { label: "Comics" },
  ],
  developers: [
    {
      name: "DarkDragonkz",
      github: "https://github.com/DarkDragonkz",
    },
  ],
} satisfies ExtensionInfo;
