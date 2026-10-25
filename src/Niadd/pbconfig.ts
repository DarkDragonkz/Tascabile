import {
  ContentRating,
  SourceIntents,
  type ExtensionInfo,
  type SourceDeveloper,
} from "@paperback/types";

export default {
  name: "Niadd",
  description:
    "Manga in italiano da Niadd (it.niadd.com), stesso catalogo e reader della storica NineManga.",
  version: "1.0.0",
  icon: "icon.png",
  language: "it",
  contentRating: ContentRating.EVERYONE as ContentRating,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [
    {
      label: "Italiano 🇮🇹",
      textColor: "#ffffff",
      backgroundColor: "#28eac2",
    },
  ],
  developers: [
    { name: "DarkDragonkz", github: "https://github.com/DarkDragonkz" },
  ] as SourceDeveloper[],
} satisfies ExtensionInfo;
