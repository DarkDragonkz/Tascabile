import { ContentRating } from "@paperback/types";
import { basePbConfig } from "../FansubGeneric/basePbConfig";

const pbConfig = { ...basePbConfig };

pbConfig.name = "HastaTeamDDT";
pbConfig.description = "Manga e scanlation in italiano da HastaTeam DDT.";
pbConfig.language = "it";
pbConfig.icon = "icon.png";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
