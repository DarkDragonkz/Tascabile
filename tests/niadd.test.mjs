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
const IT = niadd.NIADD_LANGUAGES.it.baseUrl;
const fixture = (name) => readFile(`fixtures/niadd/${name}.html`, "utf8");

await test("lists parse 60 unique cards with HTTPS covers and latest chapter IDs", async () => {
  const cards = niadd.parseMangaList(await fixture("list-new-update"), IT);
  assert.equal(cards.length, 60);
  assert.equal(new Set(cards.map((card) => card.mangaId)).size, 60);
  assert.deepEqual(
    { mangaId: cards[0].mangaId, title: cards[0].title, latest: cards[0].latestChapterId },
    { mangaId: "Insomnia", title: "Insomnia", latest: "989282" },
  );
  assert.ok(cards.every((card) => card.imageUrl.startsWith("https://")));
  assert.ok(cards[0].updatedAt instanceof Date && !Number.isNaN(cards[0].updatedAt.getTime()));
  assert.match(cards[0].intro, /20 nights/u);
  assert.deepEqual(cards[0].genres.slice(0, 2), ["Demons", "Psychological"]);
});

await test("search results use the same card parser", async () => {
  const cards = niadd.parseMangaList(await fixture("search-one-piece"), IT);
  assert.equal(cards.length, 11);
  assert.ok(cards.some((card) => card.mangaId === "One_Piece"));
});

await test("Italian details expose title, cover, synopsis, people, genres and status", async () => {
  const details = niadd.parseMangaDetails(await fixture("manga-one-piece"), IT, "it");
  assert.equal(details.title, "One Piece");
  assert.match(details.imageUrl, /^https:\/\/img11\.niadd\.com\//u);
  assert.match(details.synopsis, /Rufy/u);
  assert.equal(details.author, "ODA Eiichiro");
  assert.equal(details.artist, "ODA Eiichiro");
  assert.deepEqual(
    details.genres.map((genre) => genre.title),
    ["Azione", "Shounen", "Avventura"],
  );
  assert.equal(details.status, "In corso");
  assert.equal(details.released, "1997");
  assert.ok(details.secondaryTitles.length > 0);
  assert.equal(details.mature, false);
});

await test("Italian chapter list keeps site order with numeric IDs, numbers and dates", async () => {
  const chapters = niadd.parseChapters(await fixture("chapters-insomnia"), "Insomnia");
  assert.equal(chapters.length, 20);
  assert.equal(new Set(chapters.map((chapter) => chapter.chapterId)).size, 20);
  assert.deepEqual(chapters[0], {
    chapterId: "989282",
    // "Insomnia 21" repeats the series and the number Paperback already shows.
    title: "",
    chapNum: 21,
    volume: undefined,
    publishDate: new Date(2026, 9, 24),
  });
  assert.equal(chapters.at(-1).chapNum, 2);
});

await test("chapter titles keep only the team's own title", () => {
  const t = niadd.chapterDisplayTitle;
  assert.equal(t("Insomnia 21", "Insomnia"), "");
  assert.equal(t("BJ Alex (PT/BR) Cap 86", "BJ Alex (PT/BR)"), "");
  assert.equal(t("Solo Leveling 179.5", "Solo Leveling"), "");
  assert.equal(t("Поднятие уровня в одиночку Том 2 Глава 200", "Поднятие уровня в одиночку"), "");
  assert.equal(
    t("Поднятие уровня в одиночку 1 - 0 Пролог", "Поднятие уровня в одиночку"),
    "Пролог",
  );
  assert.equal(
    t("One Piece Party3: Capitolo speciale-Momotaro Rufy", "One Piece Party"),
    "Capitolo speciale-Momotaro Rufy",
  );
  assert.equal(t("Поднятие уровня в одиночку: Глава v2 - 131", "Поднятие уровня в одиночку"), "");
  assert.equal(t("Поднятие уровня в одиночку v1 - 88", "Поднятие уровня в одиночку"), "");
  assert.equal(t("Oneshot", "Altra serie"), "Oneshot");
});

await test("latest chapter labels read as a single chapter in the catalogue language", () => {
  const l = niadd.latestChapterLabel;
  assert.equal(l("Episodi 87.6", "it"), "Capitolo 87.6");
  assert.equal(l("Episódios 339", "br"), "Capítulo 339");
  assert.equal(l("Chapitres 14", "fr"), "Chapitre 14");
  assert.equal(l("Том 14 Глава 67", "ru"), "Том 14 Глава 67");
  assert.equal(l("Akane-banashi 221", "fr"), "Akane-banashi 221");
  assert.equal(l(undefined, "it"), undefined);
});

await test("Italian reader returns only pic_box images, in order, across -10-N pages", async () => {
  const first = niadd.parseReaderPage(await fixture("reader-insomnia-3-10-1"), IT);
  const second = niadd.parseReaderPage(await fixture("reader-insomnia-3-10-2"), IT);
  assert.equal(first.images.length, 10);
  assert.equal(second.images.length, 7);
  assert.deepEqual(first.pageUrls, [
    "https://it.niadd.com/chapter/Insomnia_3/986254-10-1.html",
    "https://it.niadd.com/chapter/Insomnia_3/986254-10-2.html",
  ]);
  assert.equal(niadd.dedupeImages([...first.images, ...second.images]).length, 17);
});

// Expected values come from the captured pages (fixtures/niadd/<lang>/).
const LANGUAGES = {
  br: {
    title: "BJ Alex (PT/BR)",
    status: "Em progresso",
    artist: "Mingwa",
    genres: 2,
    readerPages: 4,
  },
  fr: {
    title: "Solo Leveling",
    status: "En cours",
    author: "Jang Sung-Lak",
    artist: "Gee So-Lyung",
    genres: 3,
    readerPages: 8,
  },
  ru: {
    title: "Поднятие уровня в одиночку",
    status: "Постоянный",
    author: "Чжан Санг-Лак",
    artist: "Чжан Санг-Лак",
    released: "2018",
    genres: 3,
    readerPages: 4,
  },
};

for (const [language, expected] of Object.entries(LANGUAGES)) {
  const base = niadd.NIADD_LANGUAGES[language].baseUrl;
  const read = (name) => fixture(`${language}/${name}`);

  await test(`${language}: lists, search and dates`, async () => {
    const now = new Date(2026, 9, 25, 18).getTime();
    const cards = niadd.parseMangaList(await read("list-new-update"), base, now);
    assert.ok(cards.length >= 59);
    assert.ok(cards.every((card) => card.imageUrl.startsWith("https://")));
    // Every card date is parsed, relative ones ("Il y a 2 heures", "45 минут назад") included.
    assert.equal(cards.filter((card) => !card.updatedAt).length, 0);
    assert.ok(cards.every((card) => card.updatedAt.getTime() <= now));
    assert.ok(niadd.parseMangaList(await read("search"), base).length > 0);
  });

  await test(`${language}: details read schema.org fields, not translated labels`, async () => {
    const details = niadd.parseMangaDetails(await read("manga"), base, language);
    assert.equal(details.title, expected.title);
    assert.equal(details.status, expected.status);
    assert.equal(details.artist, expected.artist);
    if (expected.author) assert.equal(details.author, expected.author);
    if (expected.released) assert.equal(details.released, expected.released);
    assert.equal(details.genres.length, expected.genres);
    assert.ok(details.genres.every((genre) => !/^\d{4}$/u.test(genre.title)));
    assert.ok(details.synopsis.length > 100);
  });

  await test(`${language}: chapters get numbers, volumes and dates`, async () => {
    const meta = JSON.parse(await readFile(`fixtures/niadd/${language}/meta.json`, "utf8"));
    const details = niadd.parseMangaDetails(await read("manga"), base, language);
    const chapters = niadd.parseChapters(await read("chapters"), details.title);
    assert.ok(chapters.length > 50);
    assert.ok(chapters.some((chapter) => chapter.chapterId === meta.chapterId));
    assert.ok(chapters.every((chapter) => chapter.publishDate instanceof Date));
    // Chapter 0 is legitimate (prologues: ru has "… 0", "Том 1 Глава 0" and "1 - 0 Пролог");
    // numbers must not otherwise fall back to 0.
    const zero = chapters.filter((chapter) => chapter.chapNum === 0);
    assert.ok(zero.length <= 3, zero.map((chapter) => chapter.title).join(", "));
    // Displayed titles drop the series name and the bare number.
    assert.ok(chapters.every((chapter) => !chapter.title.startsWith(details.title)));
    assert.ok(chapters.every((chapter) => !/^\d+(?:[.,]\d+)?$/u.test(chapter.title)));
  });

  await test(`${language}: reader stays on its own site and collects every page`, async () => {
    const first = niadd.parseReaderPage(await read("reader-10-1"), base);
    const second = niadd.parseReaderPage(await read("reader-10-2"), base);
    assert.equal(first.images.length, 10);
    assert.equal(second.images.length, 10);
    assert.equal(first.pageUrls.length, expected.readerPages);
    assert.ok(first.pageUrls.every((url) => url.startsWith(`${base}/chapter/`)));
    assert.equal(niadd.dedupeImages([...first.images, ...second.images]).length, 20);
  });
}

await test("chapter numbers across the language sites", () => {
  const n = (title, manga) => niadd.parseChapterNumbers(title, manga, "");
  assert.deepEqual(n("BJ Alex (PT/BR) Cap 86", "BJ Alex (PT/BR)"), {
    chapNum: 86,
    volume: undefined,
  });
  assert.deepEqual(n("Solo Leveling Ch. 109", "Solo Leveling"), {
    chapNum: 109,
    volume: undefined,
  });
  assert.deepEqual(n("Solo Leveling 179.5", "Solo Leveling"), {
    chapNum: 179.5,
    volume: undefined,
  });
  assert.deepEqual(n("Solo Leveling 72 VF", "Solo Leveling"), { chapNum: 72, volume: undefined });
  assert.deepEqual(n("Noblesse: Kapitel 544", "Noblesse"), { chapNum: 544, volume: undefined });
  const ru = "Поднятие уровня в одиночку";
  assert.deepEqual(n(`${ru} Том 2 Глава 200`, ru), { chapNum: 200, volume: 2 });
  assert.deepEqual(n(`${ru}: 2 - 161`, ru), { chapNum: 161, volume: 2 });
  assert.deepEqual(n("One Piece 1141", "One Piece"), { chapNum: 1141, volume: undefined });
});

await test("relative dates in every site language", () => {
  const now = new Date(2026, 9, 25, 18).getTime();
  const hours = (text) => (now - niadd.parseDate(text, now).getTime()) / 3_600_000;
  assert.equal(hours("Il y a 2 heures"), 2);
  assert.equal(hours("3 несколько часов назад"), 3);
  assert.equal(hours("45 минут назад"), 0.75);
  assert.equal(hours("2 giorni fa"), 48);
  assert.deepEqual(niadd.parseDate("Mar 06, 2025", now), new Date(2025, 2, 6));
  assert.equal(niadd.parseDate("ieri", now), undefined);
});

await test("library IDs carry their language; Italian IDs stay unchanged", () => {
  assert.equal(niadd.encodeMangaId("it", "One_Piece"), "One_Piece");
  assert.equal(niadd.encodeMangaId("fr", "Solo_Leveling"), "fr:Solo_Leveling");
  assert.deepEqual(niadd.decodeMangaId("One_Piece"), { language: "it", slug: "One_Piece" });
  assert.deepEqual(niadd.decodeMangaId("ru:%D0%9F"), { language: "ru", slug: "%D0%9F" });
  // A colon that is not a known language prefix belongs to the slug.
  assert.deepEqual(niadd.decodeMangaId("Re:Zero"), { language: "it", slug: "Re:Zero" });
});

await test("IDs, reader URLs and challenge pages", () => {
  assert.equal(niadd.mangaIdFromHref("https://it.niadd.com/manga/One_Piece.html"), "One_Piece");
  assert.equal(niadd.chapterIdFromHref("/chapter/Insomnia_21/989282/"), "989282");
  assert.equal(
    niadd.chapterIdFromHref("https://it.niadd.com/chapter/Episodi-21/989282.html"),
    "989282",
  );
  assert.equal(
    niadd.readerUrl("https://fr.niadd.com", "Solo_Leveling", "707262", 2),
    "https://fr.niadd.com/chapter/Solo_Leveling/707262-10-2.html",
  );
  assert.equal(niadd.isChallengePage("<title>Just a moment...</title>"), true);
  assert.equal(niadd.isChallengePage("<title>Niadd</title>"), false);
});
