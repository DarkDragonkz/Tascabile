import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../generic/config";

const pbConfig = { ...basePbConfig };

pbConfig.name = "BatCave";
pbConfig.description = "Extension that pulls comic content from batcave.biz.";
pbConfig.language = "en";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
