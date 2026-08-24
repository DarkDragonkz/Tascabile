import {
  ContentRating,
  SourceIntents,
  type ExtensionInfo,
  type SourceDeveloper,
} from "@paperback/types";

export const basePbConfig = {
  name: "",
  description: "",
  version: "1.0.2",
  icon: "icon.png",
  language: "it",
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
  ],
  badges: [
    {
      label: "Italiano 🇮🇹",
      textColor: "#ffffff",
      backgroundColor: "#28eac2",
    },
  ],
  developers: [
    { name: "Catta1997", github: "https://github.com/Catta1997" },
    { name: "DarkDragonkz", github: "https://github.com/DarkDragonkz" },
  ] as SourceDeveloper[],
  contentRating: ContentRating.EVERYONE as ContentRating,
} satisfies ExtensionInfo;
