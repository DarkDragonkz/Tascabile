import { ContentRating, SourceIntents } from "@paperback/types";

import { basePbConfig } from "../generic/config";

const pbConfig = { ...basePbConfig };

pbConfig.name = "NineManga DEBUG";
pbConfig.description = "Temporary debug build of NineManga for English reader diagnostics.";
pbConfig.version = "1.0.0-alpha.35-debug.2";
pbConfig.language = "it";
pbConfig.contentRating = ContentRating.EVERYONE;
pbConfig.capabilities = [
  SourceIntents.CHAPTER_PROVIDING,
  SourceIntents.DISCOVER_SECTION_PROVIDING,
  SourceIntents.SEARCH_RESULT_PROVIDING,
  SourceIntents.SETTINGS_FORM_PROVIDING,
] as unknown as typeof pbConfig.capabilities;

export default pbConfig;
