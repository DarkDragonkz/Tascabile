/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import { ContentRating } from "@paperback/types";

import { BADGES } from "../common/badges";
import { basePbConfig, customVersion } from "../generic/config";

const pbConfig = {
  ...basePbConfig,
  badges: [BADGES.manga, BADGES.italian],
};

pbConfig.name = "MangaWorld";
pbConfig.description =
  "Ampio catalogo italiano di manga, manhwa e manhua: In tendenza, ultimi capitoli, generi preferiti, ricerca avanzata e reader con tutte le pagine del capitolo.";
pbConfig.version = customVersion({ increasePrerelease: 10 });
pbConfig.language = "it";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
