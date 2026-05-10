/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { ContentRating } from "@paperback/types";

import { basePbConfig } from "../generic/config";

const pbConfig = basePbConfig;

pbConfig.name = "MangaWorld";
pbConfig.description = "Extension that pulls content from www.mangaworld.mx.";
pbConfig.contentRating = ContentRating.ADULT;

export default pbConfig;
