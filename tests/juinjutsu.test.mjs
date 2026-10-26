import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "rolldown";

await mkdir("node_modules/.cache", { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/tascabile-juinjutsu-"));
after(() => rm(directory, { recursive: true, force: true }));
await build({
  input: { parsers: "src/JuinJutsu/parsers.ts" },
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const juin = await import(pathToFileURL(`${directory}/parsers.mjs`).href);
const fixture = (name) => readFile(`fixtures/juinjutsu/${name}.json`, "utf8");

await test("catalogue page lists series with stub IDs, HTTPS covers and clean synopses", async () => {
  const comics = juin.parseComicList(await fixture("comics-page-1"));
  assert.equal(comics.length, 30);
  assert.equal(new Set(comics.map((comic) => comic.mangaId)).size, 30);
  const coppelion = comics.find((comic) => comic.mangaId === "coppelion");
  assert.equal(coppelion.title, "Coppelion");
  assert.equal(coppelion.author, "Tomonori Inoue");
  assert.match(coppelion.thumbnailUrl, /^https:\/\/www\.juinjutsureader\.ovh\/content\/comics\//u);
  // Lists use the small `thumb_` image; details use the full-size cover.
  assert.match(coppelion.thumbnailUrl, /\/thumb_coppelion\.png$/u);
  assert.match(coppelion.coverUrl, /\/coppelion\.png$/u);
  // The SEO keyword paragraph ("Capitoli Coppelion ITA, … scan ITA …") is dropped.
  assert.match(coppelion.synopsis, /tute anti-radiazioni\?$/u);
  assert.doesNotMatch(coppelion.synopsis, /scan ita|torrent/iu);
  assert.ok(comics.every((comic) => comic.coverUrl.startsWith("https://")));
});

await test("latest chapters keep newest-first order with series, titles and dates", async () => {
  const updates = juin.parseLatestChapters(await fixture("latest-chapters"));
  assert.equal(updates.length, 30);
  const [first] = updates;
  assert.equal(first.comic.mangaId, "ichi-the-witch");
  assert.deepEqual(
    {
      id: first.chapter.chapterId,
      title: first.chapter.title,
      label: first.chapter.label,
      num: first.chapter.chapNum,
    },
    { id: "7171", title: "Futuri mutevoli", label: "Capitolo 59: Futuri mutevoli", num: 59 },
  );
  assert.equal(first.chapter.publishDate.getFullYear(), 2026);
  const times = updates.map((update) => update.chapter.publishDate.getTime());
  assert.deepEqual(
    times,
    [...times].sort((a, b) => b - a),
  );
});

await test("series details sort chapters newest first and read FoOlSlide subchapters", async () => {
  const { comic, chapters } = juin.parseComicDetails(await fixture("comic-choujin-x"));
  assert.equal(comic.title, "Choujin X");
  assert.equal(chapters.length, 128);
  assert.equal(new Set(chapters.map((chapter) => chapter.chapterId)).size, 128);
  // 77 is published as 77.1, 26/1 and 26/2 as 26.1 and 26.2.
  assert.equal(chapters[0].chapNum, 77.1);
  assert.match(chapters[0].label, /^Capitolo 77\.1: /u);
  assert.ok(chapters.every((chapter) => !chapter.title.startsWith("Capitolo")));
  assert.ok(chapters.some((chapter) => chapter.chapNum === 26.1));
  assert.ok(chapters.some((chapter) => chapter.chapNum === 26.2));
  for (let index = 1; index < chapters.length; index++) {
    assert.ok(chapters[index - 1].chapNum >= chapters[index].chapNum);
  }
  assert.ok(chapters.every((chapter) => chapter.volume === undefined));
});

await test("chapter pages follow filename order, including double pages", async () => {
  const pages = juin.parseChapterPages(await fixture("chapter-pages"));
  assert.equal(pages.length, 21);
  assert.deepEqual(
    pages.slice(0, 6).map((url) => url.split("/").pop()),
    ["00.jpg", "01.png", "02.png", "03.png", "04-05.png", "06.png"],
  );
  assert.ok(pages.every((url) => url.startsWith("https://www.juinjutsureader.ovh/content/")));
});

await test("API errors and invalid bodies become readable errors", () => {
  assert.throws(
    () => juin.parseJson('{"error":"Fumetto non trovato"}'),
    /Juin Jutsu: Fumetto non trovato/u,
  );
  assert.throws(() => juin.parseJson("<html>502</html>"), /risposta non valida/u);
});

await test("local search ignores case and accents and matches authors", async () => {
  const comics = juin.parseComicList(await fixture("comics-page-1"));
  const coppelion = comics.find((comic) => comic.mangaId === "coppelion");
  assert.ok(juin.matchesQuery(coppelion, "COPPÈL"));
  assert.ok(juin.matchesQuery(coppelion, "inoue"));
  assert.ok(juin.matchesQuery(coppelion, ""));
  assert.ok(!juin.matchesQuery(coppelion, "one piece"));
});

await test("FoOlSlide dates: valid timestamps parse, the zero date is unknown", () => {
  const date = juin.parseDate("2026-10-26 14:18:20");
  assert.deepEqual(
    [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()],
    [2026, 9, 26, 14],
  );
  assert.equal(juin.parseDate("0000-00-00 00:00:00"), undefined);
  assert.equal(juin.parseDate(undefined), undefined);
});
