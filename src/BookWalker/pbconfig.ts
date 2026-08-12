/* SPDX-License-Identifier: MIT */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "BookWalker",
  description: "Catalog and search extension for BOOK☆WALKER Global manga.",
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
