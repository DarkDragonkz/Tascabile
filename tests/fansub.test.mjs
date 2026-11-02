import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "rolldown";

await mkdir("node_modules/.cache", { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/tascabile-fansub-"));
after(() => rm(directory, { recursive: true, force: true }));
await build({
  input: {
    chapters: "src/FansubGeneric/chapters.ts",
    network: "src/FansubGeneric/network.ts",
    validation: "src/FansubGeneric/validation.ts",
  },
  external: ["@paperback/types"],
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const load = (name) => import(pathToFileURL(`${directory}/${name}.mjs`).href);
const { chapterLabel, chapterNumber, chapterTitle, matchesQuery } = await load("chapters");
const { isChallengeResponse, searchSegment } = await load("network");
const { FansubResponseError, parseChapterPages, parseComicDetail, parseComicList } =
  await load("validation");

// Shapes taken from the readers' API on 27 October 2026.
const chapter = (fields) => ({ volume: null, subchapter: null, title: null, ...fields });
const SAMPLES = {
  numbered: chapter({ volume: 5, chapter: 38, title: "Nonoa", full_title: "Vol.5 Ch.38 - Nonoa" }),
  part: chapter({
    volume: 6,
    chapter: 24,
    subchapter: 6,
    title: "Trigger",
    full_title: "Vol.6 Ch.24.6 - Trigger",
  }),
  oneShotCollection: chapter({
    chapter: 0,
    subchapter: 9,
    title: "Offside Trap",
    full_title: "Offside Trap",
  }),
  partWithoutChapter: chapter({
    chapter: null,
    subchapter: 2,
    title: "Preview 2",
    full_title: ".2 - Preview 2",
  }),
  emptyTitle: chapter({ volume: 1, chapter: 174, title: "", full_title: "Vol.1 Ch.174 - " }),
  untitled: chapter({ chapter: 80, full_title: "Ch.80" }),
  quoted: chapter({
    volume: 9,
    chapter: 63,
    title: '"Eeek!"',
    full_title: 'Vol.9 Ch.63 - "Eeek!"',
  }),
  volumeOnly: chapter({ volume: 4, chapter: 0, subchapter: 0, title: "", full_title: "Vol.4" }),
  extra: chapter({ chapter: null, title: "Artbook", full_title: "Artbook" }),
};

await test("chapter numbers join chapter and subchapter, extras have none", () => {
  assert.equal(chapterNumber(SAMPLES.numbered), 38);
  assert.equal(chapterNumber(SAMPLES.part), 24.6);
  assert.equal(chapterNumber(SAMPLES.oneShotCollection), 0.9);
  assert.equal(chapterNumber(SAMPLES.partWithoutChapter), 0.2);
  assert.equal(chapterNumber(SAMPLES.volumeOnly), 0);
  assert.equal(chapterNumber(SAMPLES.extra), undefined);
});

await test("parts from 10 keep the chapter number and say which part they are", () => {
  const part = (subchapter, title = null) =>
    chapter({ chapter: 24, subchapter, title, full_title: `Ch.24.${subchapter}` });
  // 24/1 and 24/10 must not both become 24.1.
  assert.equal(chapterNumber(part(1)), 24.1);
  assert.equal(chapterNumber(part(2)), 24.2);
  assert.equal(chapterNumber(part(10)), 24);
  assert.notEqual(chapterNumber(part(1)), chapterNumber(part(10)));
  assert.equal(chapterTitle(part(10, "Trigger")), "Parte 10 · Trigger");
  assert.equal(chapterTitle(part(10)), "Parte 10");
  assert.equal(chapterTitle(part(2, "Trigger")), "Trigger");
  assert.equal(chapterLabel(part(10, "Trigger")), "Capitolo 24.10 · Trigger");
  assert.equal(chapterLabel(part(1)), "Capitolo 24.1");
});

await test("chapter list titles drop empty or redundant full titles but keep extras", () => {
  assert.equal(chapterTitle(SAMPLES.numbered), "Nonoa");
  assert.equal(chapterTitle(SAMPLES.emptyTitle), "");
  assert.equal(chapterTitle(SAMPLES.untitled), "");
  assert.equal(chapterTitle(SAMPLES.extra), "Artbook");
});

await test("Home labels always say which chapter or volume came out", () => {
  assert.equal(chapterLabel(SAMPLES.numbered), "Capitolo 38 · Nonoa");
  assert.equal(chapterLabel(SAMPLES.part), "Capitolo 24.6 · Trigger");
  assert.equal(chapterLabel(SAMPLES.emptyTitle), "Capitolo 174");
  assert.equal(chapterLabel(SAMPLES.untitled), "Capitolo 80");
  assert.equal(chapterLabel(SAMPLES.quoted), "Capitolo 63 · Eeek!");
  assert.equal(chapterLabel(SAMPLES.volumeOnly), "Volume 4");
  assert.equal(chapterLabel(SAMPLES.extra), "Artbook");
});

await test("local search matches title, alternative titles and author without accents", () => {
  const comic = {
    title: "Shingeki no Kyojin",
    alt_titles: ["L'attacco dei giganti"],
    author: "Hajime Isayama",
  };
  assert.ok(matchesQuery(comic, "SHINGEKI"));
  assert.ok(matchesQuery(comic, "attàcco"));
  assert.ok(matchesQuery(comic, "isayama"));
  assert.ok(matchesQuery(comic, "  "));
  assert.ok(!matchesQuery(comic, "one piece"));
  assert.ok(matchesQuery({ title: "1 or W", author: null }, "1"));
  assert.ok(matchesQuery({ title: "1/2 Principe", author: null }, "1/2 PRINCIPE"));
  // Composed (é) and decomposed (e + U+0301) accents match each other.
  assert.ok(matchesQuery({ title: "Pok\u00e9mon", author: null }, "Poke\u0301mon"));
});

await test("search segments are encoded; titles the server cannot answer stay local", () => {
  // Live: GTO answers 400 to `/search/100%` and 200 to `/search/100%25`.
  assert.equal(searchSegment("100%"), "100%25");
  assert.equal(searchSegment("one piece"), "one%20piece");
  assert.equal(searchSegment("Kaguya-sama #2?"), "Kaguya-sama%20%232%3F");
  // A slash is refused even encoded (`%2F` → 404 on TuttoAnimeManga): local search.
  assert.equal(searchSegment("1/2 Principe"), undefined);
  assert.equal(searchSegment("a\\b c"), undefined);
  // Fewer than three letters: the API returns nothing, so also local.
  assert.equal(searchSegment("ab"), undefined);
  // "é" decomposed is two code points, but one character once composed.
  assert.equal(searchSegment("e\u0301e"), undefined);
  assert.equal(searchSegment("..."), undefined);
  // Unicode: decomposed input is sent composed (NFC), the same bytes as typed é.
  assert.equal(searchSegment("Poke\u0301mon"), searchSegment("Pok\u00e9mon"));
  assert.equal(searchSegment("Poke\u0301mon"), "Pok%C3%A9mon");
  assert.equal(searchSegment("進撃の巨人"), encodeURIComponent("進撃の巨人"));
  // Three characters even when one of them is decomposed into two code points.
  assert.equal(searchSegment("e\u0301te\u0301"), encodeURIComponent("\u00e9t\u00e9"));
});

await test("Cloudflare challenges are told apart from ordinary HTTP errors", () => {
  const response = (status, headers = {}) => ({ status, headers, url: "", cookies: [] });
  const page = (html) => () => html;
  assert.ok(isChallengeResponse(response(403, { "cf-mitigated": "challenge" }), page("")));
  assert.ok(isChallengeResponse(response(403, { "CF-Mitigated": "challenge" }), page("")));
  assert.ok(isChallengeResponse(response(503), page("<title>Just a moment...</title>")));
  assert.ok(!isChallengeResponse(response(403), page("<title>Forbidden</title>")));
  assert.ok(!isChallengeResponse(response(429), page("<title>Just a moment...</title>")));
  assert.ok(!isChallengeResponse(response(200), page('{"comics":[]}')));
});

const LIST_ITEM = {
  title: "One Piece",
  slug: "one-piece",
  thumbnail: "https://example.test/cover.jpg",
  thumbnail_small: "https://example.test/cover-small.jpg",
  adult: 0,
  author: "Eiichiro Oda",
  alt_titles: ["ワンピース"],
  last_chapter: { url: "/read/one-piece/it/vol/117/ch/1197", chapter: 1197, title: "X" },
};

await test("catalogue: valid empty list, skipped unusable series, readable failures", () => {
  assert.deepEqual(parseComicList('{"comics":[]}'), []);
  const [comic] = parseComicList(JSON.stringify({ comics: [LIST_ITEM] }));
  assert.equal(comic.slug, "one-piece");
  assert.equal(comic.last_chapter.chapter, 1197);
  assert.equal(comic.last_chapter.subchapter, null);
  // Missing optional fields get safe defaults; a series without slug cannot be opened.
  const items = parseComicList(
    JSON.stringify({
      comics: [
        { ...LIST_ITEM, author: null, alt_titles: null, last_chapter: null },
        { title: "?" },
      ],
    }),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].author, null);
  assert.deepEqual(items[0].alt_titles, []);
  assert.equal(items[0].last_chapter, null);

  assert.throws(() => parseComicList("<!DOCTYPE html><title>Just a moment...</title>"), {
    name: "FansubResponseError",
    message: /pagina HTML/u,
  });
  assert.throws(() => parseComicList(""), /risposta vuota/u);
  assert.throws(() => parseComicList('{"error":"maintenance"}'), /«comics»/u);
  assert.throws(() => parseComicList('{"comics":{}}'), FansubResponseError);
  assert.throws(() => parseComicList("[]", "Ricerca"), { message: /^Ricerca: /u });
});

await test("series details keep the API's chapter order and need title and chapters", () => {
  const detail = parseComicDetail(
    JSON.stringify({
      comic: {
        title: "Blooming Love",
        slug: "blooming-love",
        genres: [{ name: "Romance", slug: "romance" }, { name: 3 }],
        rating: null,
        chapters: [
          { url: "/read/b/it/vol/7/ch/58", chapter: 58, volume: 7, teams: [null] },
          { url: "/read/b/it/vol/7/ch/57/sub/5", chapter: 57, subchapter: 5, volume: 7 },
          { chapter: 57 },
        ],
      },
    }),
  );
  assert.deepEqual(
    detail.chapters.map((item) => item.url),
    ["/read/b/it/vol/7/ch/58", "/read/b/it/vol/7/ch/57/sub/5"],
  );
  assert.deepEqual(detail.genres, [{ name: "Romance", slug: "romance" }]);
  assert.equal(detail.rating, null);
  assert.deepEqual(detail.chapters[0].teams, [null]);
  assert.equal(detail.chapters[0].language, "");

  assert.throws(() => parseComicDetail('{"comic":{"title":"x"}}'), /comic\.chapters/u);
  assert.throws(() => parseComicDetail('{"comics":[]}'), /«comic»/u);
  assert.throws(() => parseComicDetail("Service Unavailable"), /testo non JSON/u);
});

await test("chapter pages: empty list is valid, a missing list is not", () => {
  assert.deepEqual(parseChapterPages('{"chapter":{"pages":["a.jpg",3,"b.jpg"]}}'), [
    "a.jpg",
    "b.jpg",
  ]);
  assert.deepEqual(parseChapterPages('{"chapter":{"pages":[]}}'), []);
  assert.throws(() => parseChapterPages('{"chapter":{}}'), /chapter\.pages/u);
  assert.throws(() => parseChapterPages("<html></html>"), /pagina HTML/u);
});
