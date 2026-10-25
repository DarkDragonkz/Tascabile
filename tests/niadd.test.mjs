import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "rolldown";

await mkdir("node_modules/.cache", { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/tascabile-niadd-"));
after(() => rm(directory, { recursive: true, force: true }));
await build({
  input: { parsers: "src/Niadd/parsers.ts" },
  external: ["@paperback/types", "cheerio"],
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const niadd = await import(pathToFileURL(`${directory}/parsers.mjs`).href);
const fixture = (name) => readFile(`fixtures/niadd/${name}.html`, "utf8");

await test("lists parse 60 unique cards with HTTPS covers and latest chapter IDs", async () => {
  const cards = niadd.parseMangaList(await fixture("list-new-update"));
  assert.equal(cards.length, 60);
  assert.equal(new Set(cards.map((card) => card.mangaId)).size, 60);
  assert.deepEqual(
    { mangaId: cards[0].mangaId, title: cards[0].title, latest: cards[0].latestChapterId },
    { mangaId: "Insomnia", title: "Insomnia", latest: "989282" },
  );
  assert.ok(cards.every((card) => card.imageUrl.startsWith("https://")));
  assert.ok(cards[0].updatedAt instanceof Date && !Number.isNaN(cards[0].updatedAt.getTime()));
});

await test("search results use the same card parser", async () => {
  const cards = niadd.parseMangaList(await fixture("search-one-piece"));
  assert.equal(cards.length, 11);
  assert.ok(cards.some((card) => card.mangaId === "One_Piece"));
});

await test("manga details expose title, cover, synopsis, people, genres and status", async () => {
  const details = niadd.parseMangaDetails(await fixture("manga-one-piece"));
  assert.equal(details.title, "One Piece");
  assert.match(details.imageUrl, /^https:\/\/img11\.niadd\.com\//u);
  assert.match(details.synopsis, /Rufy/u);
  assert.equal(details.author, "ODA Eiichiro");
  assert.equal(details.artist, "ODA Eiichiro");
  assert.deepEqual(
    details.genres.map((genre) => genre.title),
    ["Azione", "Shounen", "Avventura"],
  );
  assert.equal(details.status, "Ongoing");
  assert.ok(details.secondaryTitles.length > 0);
  assert.equal(details.mature, false);
});

await test("chapter list keeps site order with numeric IDs, numbers and dates", async () => {
  const chapters = niadd.parseChapters(await fixture("chapters-insomnia"), "Insomnia");
  assert.equal(chapters.length, 20);
  assert.equal(new Set(chapters.map((chapter) => chapter.chapterId)).size, 20);
  assert.deepEqual(chapters[0], {
    chapterId: "989282",
    title: "Insomnia 21",
    chapNum: 21,
    publishDate: new Date(2026, 9, 24),
  });
  assert.equal(chapters.at(-1).chapNum, 2);
});

await test("reader pages return only pic_box images, in order, across -10-N pages", async () => {
  const first = niadd.parseReaderPage(await fixture("reader-insomnia-3-10-1"));
  const second = niadd.parseReaderPage(await fixture("reader-insomnia-3-10-2"));
  assert.equal(first.images.length, 10);
  assert.equal(second.images.length, 7);
  assert.deepEqual(first.pageUrls, [
    "https://it.niadd.com/chapter/Insomnia_3/986254-10-1.html",
    "https://it.niadd.com/chapter/Insomnia_3/986254-10-2.html",
  ]);
  const all = niadd.dedupeImages([...first.images, ...second.images]);
  assert.equal(all.length, 17);
  assert.ok(all.every((url) => url.startsWith("https://wpimg.movietop.cc/")));
});

await test("IDs, reader URLs, dates and chapter numbers are normalized", () => {
  assert.equal(niadd.mangaIdFromHref("https://it.niadd.com/manga/One_Piece.html"), "One_Piece");
  assert.equal(niadd.chapterIdFromHref("/chapter/Insomnia_21/989282/"), "989282");
  assert.equal(
    niadd.chapterIdFromHref("https://it.niadd.com/chapter/Episodi-21/989282.html"),
    "989282",
  );
  assert.equal(
    niadd.readerUrl("Insomnia", "986254", 2),
    "https://it.niadd.com/chapter/Insomnia/986254-10-2.html",
  );
  assert.deepEqual(niadd.parseDate("Mar 06, 2025"), new Date(2025, 2, 6));
  assert.equal(niadd.parseDate("ieri"), undefined);
  assert.equal(
    niadd.extractChapterNumber("One Piece 1141", "One Piece", "/chapter/One_Piece_1141/982150/"),
    1141,
  );
  assert.equal(
    niadd.dedupeImages(["https://x/a.webp?acc=1", "https://x/a.webp?acc=2", "https://x/b.webp"])
      .length,
    2,
  );
});

await test("Cloudflare challenge pages are recognized", () => {
  assert.equal(niadd.isChallengePage("<title>Just a moment...</title>"), true);
  assert.equal(niadd.isChallengePage("<title>Niadd</title>"), false);
});
