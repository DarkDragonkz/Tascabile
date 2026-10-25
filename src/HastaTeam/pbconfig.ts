import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../FansubGeneric/basePbConfig";

const pbConfig = { ...basePbConfig };

pbConfig.name = "Hasta Team";
pbConfig.description =
  "Scanlation italiane di Hasta Team: progetti aggiornati di recente e un ampio archivio storico, con filtri per attività e contenuti.";
pbConfig.language = "it";
pbConfig.icon = "icon.png";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
