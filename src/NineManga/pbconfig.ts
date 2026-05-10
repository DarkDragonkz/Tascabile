import { ContentRating, SourceIntents } from "@paperback/types";

import { basePbConfig } from "../generic/config";

const pbConfig = { ...basePbConfig };

pbConfig.name = "NineManga [ENG - ESP - RUS - DEU - ITA - FRA - PT/BR]";
pbConfig.description = "Extension that pulls multi-language manga content from NineManga.";
pbConfig.language = "it";
pbConfig.contentRating = ContentRating.EVERYONE;
pbConfig.capabilities = [
  SourceIntents.CHAPTER_PROVIDING,
  SourceIntents.DISCOVER_SECTION_PROVIDING,
  SourceIntents.SEARCH_RESULT_PROVIDING,
  SourceIntents.SETTINGS_FORM_PROVIDING,
  SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
] as unknown as typeof pbConfig.capabilities;

export default pbConfig;
