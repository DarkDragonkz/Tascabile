import { ContentRating, SourceIntents } from "@paperback/types";

import { basePbConfig } from "../generic/config";

const pbConfig = { ...basePbConfig };

pbConfig.name = "BatCave";
pbConfig.description = "Extension that pulls comic content from batcave.biz.";
pbConfig.language = "en";
pbConfig.contentRating = ContentRating.EVERYONE;
pbConfig.capabilities = [
  SourceIntents.DISCOVER_SECTION_PROVIDING,
  SourceIntents.SEARCH_RESULT_PROVIDING,
  SourceIntents.CHAPTER_PROVIDING,
  SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
] as unknown as typeof pbConfig.capabilities;

export default pbConfig;
