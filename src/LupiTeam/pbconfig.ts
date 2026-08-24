import { ContentRating } from "@paperback/types";
import { basePbConfig } from "../FansubGeneric/basePbConfig";

const pbConfig = { ...basePbConfig };

pbConfig.name = "LupiTeam";
pbConfig.description = "Manga e scanlation in italiano da LupiTeam.";
pbConfig.language = "it";
pbConfig.icon = "icon.png";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
