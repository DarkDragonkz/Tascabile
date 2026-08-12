/* SPDX-License-Identifier: MIT */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "MKissa Manga",
  description: "Catalog and discovery extension for the manga database on mkissa.to.",
  version: "1.0.0-alpha.1",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  capabilities: [SourceIntents.DISCOVER_SECTION_PROVIDING, SourceIntents.SEARCH_RESULT_PROVIDING],
  badges: [],
  developers: [
    {
      name: "DarkDragonkz",
      github: "https://github.com/DarkDragonkz",
    },
  ],
} satisfies ExtensionInfo;
