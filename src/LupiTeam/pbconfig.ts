import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../FansubGeneric/basePbConfig";

const pbConfig = { ...basePbConfig };

pbConfig.name = "Lupi Team";
pbConfig.description =
  "Scanlation italiane di Lupi Team: le serie di punta come One Piece, Berserk e Hunter × Hunter, più l'archivio del team.";
pbConfig.language = "it";
pbConfig.icon = "icon.png";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
