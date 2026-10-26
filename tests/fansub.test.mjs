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
  input: { chapters: "src/FansubGeneric/chapters.ts" },
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const { chapterLabel, chapterNumber, chapterTitle, matchesQuery } = await import(
  pathToFileURL(`${directory}/chapters.mjs`).href
);

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
});
