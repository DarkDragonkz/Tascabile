import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../generic/config";

const pbConfig = { ...basePbConfig };

pbConfig.name = "ReadAllComics";
pbConfig.description = "Extension that pulls comic content from readallcomics.com.";
pbConfig.language = "en";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
