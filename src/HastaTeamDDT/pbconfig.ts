import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../FansubGeneric/basePbConfig";

const pbConfig = { ...basePbConfig };

pbConfig.name = "Hasta Team DDT";
pbConfig.description =
  "Archivio DDT di Hasta Team con volumi completi: caricamenti recenti, biblioteca alfabetica e ricerca per periodo.";
pbConfig.language = "it";
pbConfig.icon = "icon.png";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
