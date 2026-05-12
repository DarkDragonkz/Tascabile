import { ContentRating, SourceIntents } from "@paperback/types";

import { basePbConfig } from "../generic/config";

const pbConfig = { ...basePbConfig };

pbConfig.name = "NineManga";
pbConfig.description = "Extension that pulls Italian manga content from NineManga.";
pbConfig.version = "1.0.0-alpha.36";
pbConfig.language = "it";
pbConfig.contentRating = ContentRating.EVERYONE;
pbConfig.capabilities = [
  SourceIntents.CHAPTER_PROVIDING,
  SourceIntents.DISCOVER_SECTION_PROVIDING,
  SourceIntents.SEARCH_RESULT_PROVIDING,
] as unknown as typeof pbConfig.capabilities;

export default pbConfig;
