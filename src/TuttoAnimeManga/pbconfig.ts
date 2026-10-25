import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../FansubGeneric/basePbConfig";

const pbConfig = { ...basePbConfig };

pbConfig.name = "TuttoAnimeManga";
pbConfig.description =
  "Manga in italiano da TuttoAnimeManga: un grande archivio con classici come One Piece, Naruto e Bleach e le ultime uscite.";
pbConfig.language = "it";
pbConfig.icon = "icon.png";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
