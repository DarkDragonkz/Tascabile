import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";

import { ContentRating } from "@paperback/types";
import { build } from "rolldown";

await mkdir("node_modules/.cache", { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/tascabile-mangaworld-"));
after(() => rm(directory, { recursive: true, force: true }));
await build({
  input: { generic: "src/generic/main.ts", mangaworld: "src/MangaWorld/main.ts" },
  external: ["@paperback/types", "cheerio"],
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const { MangaWorldGeneric, jsonParser } = await import(
  pathToFileURL(`${directory}/generic.mjs`).href
);
const homeHtml = await readFile("fixtures/mangaworld/home-2026-10.html", "utf8");

let state;
beforeEach(() => {
  state = new Map();
  globalThis.Application = {
    getState: (key) => state.get(key),
    setState: (value, key) => state.set(key, value),
    arrayBufferToUTF8String: (data) => Buffer.from(data).toString("utf8"),
    Selector: (target, method) => ({ target, method }),
    invalidateDiscoverSections() {},
  };
});

class TestSource extends MangaWorldGeneric {
  constructor() {
    super({
      name: "test",
      domain: "https://www.mangaworld.mx",
      contentRating: ContentRating.EVERYONE,
    });
  }
}

// Home captured on 2026-10-25: trending and latest mangas list genre IDs, not objects.
const entries = jsonParser.getWindowEntry(homeHtml);
const trending = entries
  .find((entry) => entry.kind === "trending")
  .data.mostViewedChapters.map((chapter) => chapter.manga);
const latest = entries.filter((entry) => entry.kind === "manga").map((entry) => entry.data.manga);
const visible = (source, mangas) =>
  mangas.filter((manga) => source.homeContentRating(manga, entries)).length;

await test("Home payload genres are IDs resolved through the global genre list", () => {
  assert.ok(trending.length > 0 && latest.length > 0);
  assert.equal(typeof trending[0].genres[0], "string");
  const source = new TestSource();
  // Without user filters only migrated 18+ titles (hidden by default) may disappear.
  assert.equal(visible(source, trending), trending.length);
  assert.ok(visible(source, latest) >= latest.length - 2);
});

await test("hidden genres and types apply to trending and latest chapters", () => {
  const source = new TestSource();
  const genreOf = (manga) =>
    entries
      .find((entry) => entry.kind === "global")
      .data.globalData.genres.find((genre) => genre._id === manga.genres[0]).slug;

  state.set("hide_tags", [genreOf(trending[0])]);
  assert.ok(visible(source, trending) < trending.length);
  assert.equal(source.homeContentRating(trending[0], entries), undefined);

  state.set("hide_tags", []);
  state.set("hide_type", [trending[0].typeT.toLowerCase()]);
  assert.equal(source.homeContentRating(trending[0], entries), undefined);
});

await test("MangaWorld's 18+ flag (vm18) marks Home titles as adult", () => {
  const source = new TestSource();
  const manga = { ...trending[0], vm18: true };
  assert.equal(source.homeContentRating(manga, entries), ContentRating.ADULT);
  assert.notEqual(source.homeContentRating(trending[0], entries), ContentRating.ADULT);
});

// The MangaWorld entry point builds its extension on import, reading Application lazily.
globalThis.Application = { getState: () => undefined, arrayBufferToUTF8String: (d) => d };
const { MangaWorld, trendingChapters } = await import(
  pathToFileURL(`${directory}/mangaworld.mjs`).href
);
MangaWorld.requestManager.fetchText = async () => homeHtml;

await test("In tendenza shows each series once, with the chapters it trends for", async () => {
  // The capture lists ten chapters for five series, five of them One Piece 28–32.
  const { items } = await MangaWorld.getDiscoverSectionItems({ id: "popular_section" }, undefined);
  const ids = items.map((item) => item.mangaId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(items.length, 5);
  const onePiece = items.find((item) => item.mangaId.endsWith("/one-piece"));
  assert.equal(onePiece.supertitle, "Capitoli 28–32");
  assert.ok(items.every((item) => item.summary && item.imageUrl.startsWith("https://")));
});

await test("trending chapter labels: single, consecutive runs and scattered chapters", () => {
  assert.equal(trendingChapters(["Capitolo 356"]), "Capitolo 356");
  assert.equal(trendingChapters(["Capitolo 53", "Capitolo 54"]), "Capitoli 53–54");
  assert.equal(
    trendingChapters(["Capitolo 5", "Capitolo 9", "Capitolo 12"]),
    "Capitolo 5 e altri 2",
  );
  assert.equal(trendingChapters(["Oneshot", "Capitolo 2"]), "Oneshot e altri 1");
});

await test("Più letti del mese shows the type and this month's reads", async () => {
  const { items } = await MangaWorld.getDiscoverSectionItems({ id: "mese_section" }, undefined);
  assert.equal(items.length, 10);
  assert.match(items[0].subtitle, /^\S+ · 1\.311\.073 letture$/u);
});
