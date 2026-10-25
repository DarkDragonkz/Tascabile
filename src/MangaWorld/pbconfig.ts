/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import { ContentRating } from "@paperback/types";

import { basePbConfig, customVersion } from "../generic/config";

const pbConfig = {
  ...basePbConfig,
  badges: [
    { label: "Italiano 🇮🇹", textColor: "#ffffff", backgroundColor: "#28eac2" },
    { label: "Manga · Manhwa · Manhua", textColor: "#ffffff", backgroundColor: "#5965f2" },
  ],
};

pbConfig.name = "MangaWorld";
pbConfig.description =
  "Ampio catalogo italiano di manga, manhwa e manhua: In tendenza, ultimi capitoli, generi preferiti, ricerca avanzata e reader con tutte le pagine del capitolo.";
pbConfig.version = customVersion({ increasePrerelease: 8 });
pbConfig.language = "it";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
