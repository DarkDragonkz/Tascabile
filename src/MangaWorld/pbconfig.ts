/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import { ContentRating } from "@paperback/types";

import { basePbConfig, customVersion } from "../generic/config";

const pbConfig = { ...basePbConfig };

pbConfig.name = "MangaWorld";
pbConfig.description =
  "Manga, manhwa e manhua in italiano da MangaWorld, con ricerca avanzata nativa e Home ottimizzata per Paperback 0.9.";
pbConfig.version = customVersion({ increasePrerelease: 1 });
pbConfig.language = "it";
pbConfig.contentRating = ContentRating.EVERYONE;

export default pbConfig;
