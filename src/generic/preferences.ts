/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

const MIGRATED_ADULT_GENRES = new Set([
  "adulti",
  "adult",
  "doujinshi",
  "hentai",
  "lolicon",
  "shotacon",
  "smut",
]);

export const HOME_CACHE_SECONDS = 15;
export const MANGA_CACHE_SECONDS = 20;
export const ARCHIVE_CACHE_SECONDS = 5;
export const READER_CACHE_SECONDS = 10;

export function getBooleanSetting(key: string, defaultValue: boolean): boolean {
  return (Application.getState(key) as boolean | undefined) ?? defaultValue;
}

export function hideMigratedAdultContent(): boolean {
  return getBooleanSetting("hide_migrated_adult_content", true);
}

export function normalizeFilterValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function isMigratedAdultGenre(value: string): boolean {
  const normalized = normalizeFilterValue(value);
  return MIGRATED_ADULT_GENRES.has(normalized);
}

export function isMigratedAdultGenreHidden(value: string): boolean {
  return hideMigratedAdultContent() && isMigratedAdultGenre(value);
}

export function getFavoriteGenres(): string[] {
  return (Application.getState("fav_tags_new") as string[] | undefined) ?? [];
}

export function getDefaultType(): string | undefined {
  return ((Application.getState("def_type") as string[] | undefined) ?? [])[0];
}
