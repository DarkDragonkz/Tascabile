// MangaWorld's HTML fallbacks, used when a page has no `$MC` JSON payload.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";

import { ContentRating } from "@paperback/types";
import { build } from "rolldown";

await mkdir("node_modules/.cache", { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/tascabile-mwfallback-"));
after(() => rm(directory, { recursive: true, force: true }));
await build({
  input: { mangaworld: "src/MangaWorld/main.ts" },
  external: ["@paperback/types", "cheerio"],
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const { MangaWorld } = await import(pathToFileURL(`${directory}/mangaworld.mjs`).href);

const BASE = "https://www.mangaworld.mx";
const MANGA = "1708/one-piece";
const detailHtml = await readFile("fixtures/mangaworld/fallback-detail.html", "utf8");
const readerHtml = await readFile("fixtures/mangaworld/fallback-reader-list.html", "utf8");
// The same page with its scans removed: only the logo, a cover and a banner are left.
const coversOnlyHtml = readerHtml.replace(/<div id="page">[\s\S]*?<\/script>/u, "");

let routes;
const requested = [];
beforeEach(() => {
  requested.length = 0;
  MangaWorld.requestManager.clearCache();
  const state = new Map();
  globalThis.Application = {
    getState: (key) => state.get(key),
    setState: (value, key) => state.set(key, value),
    arrayBufferToUTF8String: (data) => Buffer.from(data).toString("utf8"),
    Selector: (target, method) => ({ target, method }),
    async scheduleRequest({ url }) {
      requested.push(url);
      const body = routes[url];
      if (body === undefined) return [{ status: 404, headers: {}, url }, new ArrayBuffer(0)];
      return [{ status: 200, headers: {}, url }, new TextEncoder().encode(body).buffer];
    },
  };
  routes = { [`${BASE}/manga/${MANGA}`]: detailHtml };
});

const chapter = { chapterId: "6ae772", sourceManga: { mangaId: MANGA } };

await test("details fallback reads the details box, not the menu's genres", async () => {
  const { mangaInfo } = await MangaWorld.getMangaDetails(MANGA);
  assert.equal(mangaInfo.primaryTitle, "One Piece");
  assert.deepEqual(
    mangaInfo.tagGroups[0].tags.map((tag) => tag.title),
    ["Avventura", "Azione", "Shounen"],
  );
  // The menu lists "Adulti": read page-wide, it marked every series 18+.
  assert.equal(mangaInfo.contentRating, ContentRating.EVERYONE);
  assert.equal(mangaInfo.author, "ODA Eiichiro");
  assert.equal(mangaInfo.status, "In corso");
  assert.deepEqual(mangaInfo.additionalInfo, { type: "Manga" });
  assert.equal(mangaInfo.thumbnailUrl, "https://cdn.mangaworld.mx/mangas/5fa4.jpg");
});

await test("details fallback without a details box reads no menu links at all", async () => {
  routes[`${BASE}/manga/${MANGA}`] = detailHtml.replace(
    /<div class="info">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/u,
    "",
  );
  const { mangaInfo } = await MangaWorld.getMangaDetails(MANGA);
  assert.deepEqual(mangaInfo.tagGroups, []);
  assert.equal(mangaInfo.contentRating, ContentRating.EVERYONE);
  assert.equal(mangaInfo.author, "");
  assert.equal(mangaInfo.status, "");
});

await test("chapter list fallback reads numbers, decimals and Italian dates", async () => {
  const chapters = await MangaWorld.getChapters({ mangaId: MANGA, mangaInfo: {} });
  assert.deepEqual(
    chapters.map((item) => [item.chapterId, item.chapNum]),
    [
      ["6ae772", 1197],
      ["6ae771", 1196.5],
    ],
  );
  const date = chapters[0].publishDate;
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2026, 10, 2]);
});

await test("reader fallback asks for the full list and keeps only chapter scans", async () => {
  routes[`${BASE}/manga/${MANGA}/read/6ae772?style=list`] = readerHtml;
  const { pages } = await MangaWorld.getChapterDetails(chapter);
  // The default reader page holds one scan; `style=list` holds them all.
  assert.equal(requested.at(-1), `${BASE}/manga/${MANGA}/read/6ae772?style=list`);
  assert.deepEqual(
    pages.map((url) => url.split("/").pop()),
    ["1.jpg", "2.jpg", "3.jpg"],
  );
  assert.ok(pages.every((url) => url.startsWith("https://cdn.mangaworld.mx/chapters/")));
});

await test("reader fallback without scans fails instead of showing covers", async () => {
  routes[`${BASE}/manga/${MANGA}/read/6ae772?style=list`] = coversOnlyHtml;
  await assert.rejects(MangaWorld.getChapterDetails(chapter), /nessuna pagina valida/u);
});

await test("reader fallback reports HTTP errors", async () => {
  await assert.rejects(MangaWorld.getChapterDetails(chapter), /MangaWorld HTTP 404/u);
});
