import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../FansubGeneric/basePbConfig";

const pbConfig = { ...basePbConfig };

pbConfig.name = "Phoenix Scans";
pbConfig.description =
  "Scanlation italiane di Phoenix Scans: ultime uscite, serie aggiornate di recente e catalogo completo.";
pbConfig.language = "it";
pbConfig.icon = "icon.png";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
