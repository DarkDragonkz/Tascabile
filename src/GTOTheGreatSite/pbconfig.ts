import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../FansubGeneric/basePbConfig";

const pbConfig = { ...basePbConfig };

pbConfig.name = "GTO The Great Site";
pbConfig.description =
  "Scanlation italiane di GTO The Great Site: l'Universo GTO di Onizuka e gli altri progetti del team, con ultime release e ricerca per area del catalogo.";
pbConfig.language = "it";
pbConfig.icon = "icon.png";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
