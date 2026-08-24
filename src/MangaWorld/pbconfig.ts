/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import { ContentRating } from "@paperback/types";

import { basePbConfig, customVersion } from "../generic/config";

const pbConfig = { ...basePbConfig };

pbConfig.name = "MangaWorld";
pbConfig.description =
  "Manga, manhwa e manhua in italiano da MangaWorld, con ricerca avanzata e caricamento completo dei capitoli.";
pbConfig.version = customVersion({ increasePrerelease: 3 });
pbConfig.language = "it";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
