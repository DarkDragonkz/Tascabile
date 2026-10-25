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
  input: { generic: "src/generic/main.ts" },
  external: ["@paperback/types", "cheerio"],
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const { MangaWorldGeneric, jsonParser } = await import(
  pathToFileURL(`${directory}/generic.mjs`).href
);

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
const entries = jsonParser.getWindowEntry(
  await readFile("fixtures/mangaworld/home-2026-10.html", "utf8"),
);
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
