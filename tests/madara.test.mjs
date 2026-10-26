import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "rolldown";

await mkdir("node_modules/.cache", { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/tascabile-madara-"));
after(() => rm(directory, { recursive: true, force: true }));
await build({
  input: { parsers: "src/MadaraGeneric/parsers.ts" },
  external: ["cheerio"],
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const madara = await import(pathToFileURL(`${directory}/parsers.mjs`).href);
const fixture = (site, name) => readFile(`fixtures/${site}/${name}.html`, "utf8");
// Fixtures were captured on 26 October 2026 in the evening.
const NOW = new Date(2026, 9, 26, 20).getTime();

await test("Shinobi lists parse cards with full covers, type and latest chapter", async () => {
  const cards = madara.parseMangaList(await fixture("shinobiscans", "list-latest"), NOW);
  assert.equal(cards.length, 6);
  assert.deepEqual(
    {
      id: cards[0].mangaId,
      title: cards[0].title,
      type: cards[0].type,
      chapter: cards[0].latestChapterId,
      label: cards[0].latestChapterTitle,
    },
    {
      id: "resurrection-of-the-catastrophic-hero",
      title: "The Return of the Disaster-Class Hero",
      type: "Manhwa",
      chapter: "volume-1/21",
      label: "Capitolo 21",
    },
  );
  // The largest srcset candidate, not the 110×150 thumbnail.
  assert.match(cards[0].imageUrl, /-350x476\.jpg$/u);
  assert.deepEqual(
    [cards[0].updatedAt.getFullYear(), cards[0].updatedAt.getMonth(), cards[0].updatedAt.getDate()],
    [2026, 9, 2],
  );
  assert.ok(madara.hasNextPage(await fixture("shinobiscans", "list-latest"), 1));
});

await test("series without chapters and promotional badges are not shown as chapters/types", async () => {
  const cards = madara.parseMangaList(await fixture("shinobiscans", "list-new"), NOW);
  const ghostblade = cards.find((card) => card.mangaId === "ghostblade");
  assert.equal(ghostblade.type, undefined);
  assert.equal(ghostblade.latestChapterId, undefined);
  assert.equal(ghostblade.latestChapterTitle, undefined);
});

await test("search results use the same card parser on both sites", async () => {
  const shinobi = madara.parseMangaList(await fixture("shinobiscans", "search-the"), NOW);
  assert.equal(shinobi.length, 6);
  assert.equal(shinobi[0].mangaId, "the-red-king");
  const shinigami = madara.parseMangaList(await fixture("animeshinigami", "search-genre"), NOW);
  assert.ok(shinigami.length > 0);
  assert.ok(shinigami.every((card) => card.imageUrl.startsWith("https://www.animeshinigami.com/")));
});

await test("Shinobi details: title, original cover, people, genres, status and year", async () => {
  const details = madara.parseMangaDetails(await fixture("shinobiscans", "manga"));
  assert.equal(details.title, "The Return of the Disaster-Class Hero");
  assert.equal(
    details.imageUrl,
    "https://shinobiscans.com/wp-content/uploads/2021/10/rdch-new-cover-FINAL.jpg",
  );
  assert.match(details.synopsis, /^I morti non possono parlare/u);
  assert.deepEqual(details.authors, ["SanjiJikSong"]);
  assert.deepEqual(details.artists, ["Park Do-Hyun (REDICE STUDIO)"]);
  assert.deepEqual(
    details.genres.map((genre) => genre.id),
    ["anti-eroe", "apocalisse", "fantasy", "manhwa", "webtoon"],
  );
  assert.equal(details.status, "In corso");
  assert.equal(details.released, "2021");
  assert.equal(details.type, "Manhwa");
  assert.ok(details.secondaryTitles.includes("Resurrection of the Disaster-Class Hero"));
  assert.ok(!details.secondaryTitles.includes(details.title));
  assert.equal(details.adult, false);
});

await test("AnimeShinigami details: title outside .post-title and synopsis from meta", async () => {
  const details = madara.parseMangaDetails(await fixture("animeshinigami", "manga"));
  assert.equal(details.title, "Nano Machine");
  assert.match(details.synopsis, /^Dopo essere stato disprezzato/u);
  assert.equal(details.type, "Manhwa");
  assert.equal(details.status, "In corso");
  assert.equal(details.genres.length, 6);
});

await test("chapters keep site order with IDs, numbers, volumes and every date format", async () => {
  const shinobi = madara.parseChapters(await fixture("shinobiscans", "chapters-ajax"), NOW);
  assert.equal(shinobi.length, 24);
  assert.deepEqual(
    { id: shinobi[0].chapterId, num: shinobi[0].chapNum, volume: shinobi[0].volume },
    { id: "volume-1/21", num: 21, volume: 1 },
  );
  assert.equal(shinobi.at(-1).chapterId, "volume-1/0-a");
  assert.equal(shinobi.at(-1).chapNum, 0);
  // Older pages embed the same list, used when the AJAX endpoint fails.
  assert.equal(madara.parseChapters(await fixture("shinobiscans", "manga"), NOW).length, 24);

  const shinigami = madara.parseChapters(await fixture("animeshinigami", "chapters-ajax"), NOW);
  assert.equal(shinigami.length, 316);
  assert.deepEqual(
    shinigami.slice(0, 2).map((chapter) => [chapter.chapterId, chapter.chapNum]),
    [
      ["capitolo-316", 316],
      ["capitolo-315", 315],
    ],
  );
  assert.equal(shinigami.at(-1).chapNum, 1);
  // "3 ore ago" (relative) and "Ottobre 1, 2026" (month first).
  assert.equal(shinigami[0].publishDate.getTime(), NOW - 3 * 3_600_000);
  assert.deepEqual(
    [shinigami[1].publishDate.getMonth(), shinigami[1].publishDate.getDate()],
    [9, 1],
  );
  assert.ok(shinigami.every((chapter) => chapter.volume === undefined));
});

await test("reader images are trimmed, HTTPS and in page order", async () => {
  const shinobi = madara.parseChapterImages(await fixture("shinobiscans", "reader"));
  assert.equal(shinobi.length, 12);
  assert.match(
    shinobi[0],
    /^https:\/\/shinobiscans\.com\/wp-content\/uploads\/WP-manga\/.+\/0\.jpg$/u,
  );
  const shinigami = madara.parseChapterImages(await fixture("animeshinigami", "reader"));
  assert.equal(shinigami.length, 13);
  assert.match(shinigami[0], /Nano-M00\.jpg$/u);
});

await test("genre filters come from each site's search form, without counts", async () => {
  const shinobi = madara.parseGenreOptions(await fixture("shinobiscans", "search-the"));
  assert.equal(shinobi.length, 46);
  assert.deepEqual(shinobi[1], { id: "anti-eroe", title: "Anti eroe" });
  const shinigami = madara.parseGenreOptions(await fixture("animeshinigami", "search-the"));
  assert.deepEqual(
    shinigami.map((genre) => genre.id),
    [
      "arti-marziali",
      "avventura",
      "azione",
      "commedia",
      "fantasy",
      "romantico",
      "sci-fi",
      "scolastico",
      "shounen",
    ],
  );
});

await test("dates: Italian and English months, ISO, numeric and relative", () => {
  const ymd = (date) => [date.getFullYear(), date.getMonth(), date.getDate()];
  assert.deepEqual(ymd(madara.parseDate("2 Ottobre 2026", NOW)), [2026, 9, 2]);
  assert.deepEqual(ymd(madara.parseDate("Settembre 28, 2026", NOW)), [2026, 8, 28]);
  assert.deepEqual(ymd(madara.parseDate("March 5, 2025", NOW)), [2025, 2, 5]);
  assert.deepEqual(ymd(madara.parseDate("2023-07-20 20:32:45", NOW)), [2023, 6, 20]);
  assert.deepEqual(ymd(madara.parseDate("05/03/2025", NOW)), [2025, 2, 5]);
  assert.equal(madara.parseDate("2 giorni fa", NOW).getTime(), NOW - 2 * 86_400_000);
  assert.equal(madara.parseDate("1 day ago", NOW).getTime(), NOW - 86_400_000);
  assert.equal(madara.parseDate("", NOW), undefined);
  assert.equal(madara.parseDate("domani", NOW), undefined);
});

await test("URL helpers extract series slugs and chapter paths", () => {
  assert.equal(madara.mangaIdFromUrl("https://shinobiscans.com/manga/overgeared/"), "overgeared");
  assert.equal(
    madara.chapterIdFromUrl("https://shinobiscans.com/manga/overgeared/volume-1/76/"),
    "volume-1/76",
  );
  assert.equal(
    madara.chapterIdFromUrl(
      "https://www.animeshinigami.com/manga/nano-machine/capitolo-316/?style=list",
    ),
    "capitolo-316",
  );
  assert.equal(madara.chapterIdFromUrl("https://shinobiscans.com/manga/overgeared/"), undefined);
  assert.equal(madara.mangaIdFromUrl("https://shinobiscans.com/blog/news/"), undefined);
});
