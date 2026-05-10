import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../generic/config";

const pbConfig = basePbConfig;

pbConfig.name = "MangaWorld";
pbConfig.description = "Extension that pulls content from www.mangaworld.mx.";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
