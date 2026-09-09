import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "rolldown";

await mkdir("node_modules/.cache", { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/tascabile-tests-"));
after(() => rm(directory, { recursive: true, force: true }));
await build({
  input: {
    cache: "src/common/requestCache.ts",
    utils: "src/generic/utils.ts",
    network: "src/generic/network.ts",
    fansub: "src/FansubGeneric/network.ts",
    forms: "src/generic/forms.ts",
  },
  external: ["@paperback/types", "cheerio"],
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const load = (name) => import(pathToFileURL(`${directory}/${name}.mjs`).href);
const { RequestCache } = await load("cache");
const { FilterPreferences, JsonParser } = await load("utils");
const { Requests } = await load("network");
const { APIRequests } = await load("fansub");
const { Forms } = await load("forms");
const fixture = await readFile("fixtures/mangaworld/tags.html", "utf8");
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
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("concurrent requests share one load and reuse the cached response", async () => {
  const cache = new RequestCache();
  const response = deferred();
  let requests = 0;
  const fetch = () => {
    requests++;
    return response.promise;
  };
  const a = cache.get("url", 60, fetch);
  const b = cache.get("url", 60, fetch);
  await Promise.resolve();
  assert.equal(requests, 1);
  response.resolve("data");
  assert.deepEqual(await Promise.all([a, b]), ["data", "data"]);
  assert.equal(await cache.get("url", 60, fetch), "data");
  assert.equal(requests, 1);
});

test("clearing during a request keeps the new pending request registered", async () => {
  const cache = new RequestCache();
  const old = deferred(),
    fresh = deferred();
  const a = cache.get("url", 60, () => old.promise);
  cache.clear();
  const b = cache.get("url", 60, () => fresh.promise);
  old.resolve("stale");
  assert.equal(await a, "stale");
  let duplicate = false;
  const c = cache.get("url", 60, () => {
    duplicate = true;
    return "wrong";
  });
  fresh.resolve("fresh");
  assert.deepEqual(await Promise.all([b, c]), ["fresh", "fresh"]);
  assert.equal(duplicate, false);
});

test("an old response finishing last cannot overwrite a refreshed cache", async () => {
  const cache = new RequestCache();
  const old = deferred();
  const a = cache.get("url", 60, () => old.promise);
  cache.clear();
  await cache.get("url", 60, async () => "fresh");
  old.resolve("stale");
  await a;
  assert.equal(await cache.get("url", 60, async () => "unexpected"), "fresh");
});

test("a rejected load can be retried; zero TTL never stores a response", async () => {
  const cache = new RequestCache();
  await assert.rejects(
    cache.get("url", 60, () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.equal(await cache.get("url", 0, async () => "first"), "first");
  assert.equal(await cache.get("url", 0, async () => "second"), "second");
});

test("cached responses expire and the cache remains bounded", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const cache = new RequestCache();
  await cache.get("url", 1, async () => "first");
  t.mock.timers.tick(1001);
  assert.equal(await cache.get("url", 60, async () => "fresh"), "fresh");
  for (let i = 0; i < 64; i++) await cache.get(`other-${i}`, 60, async () => i);
  assert.equal(await cache.get("url", 60, async () => "evicted"), "evicted");
});

for (const kind of ["MangaWorld", "fansub"]) {
  test(`${kind} network coalesces requests and invalidates safely`, async () => {
    const requests =
      kind === "MangaWorld" ? new Requests() : new APIRequests("https://example.test/api");
    const fetch = () =>
      kind === "MangaWorld"
        ? requests.fetchText("https://example.test", 60)
        : requests.apiMangaDetails("series");
    const pending = [];
    Application.scheduleRequest = () => {
      const value = deferred();
      pending.push(value);
      return value.promise;
    };
    const a = fetch(),
      b = fetch();
    await Promise.resolve();
    assert.equal(pending.length, 1);
    requests.clearCache();
    const c = fetch();
    await Promise.resolve();
    assert.equal(pending.length, 2);
    pending[1].resolve([{ status: 200 }, Buffer.from("fresh")]);
    assert.equal(await c, "fresh");
    pending[0].resolve([{ status: 200 }, Buffer.from("old")]);
    assert.deepEqual(await Promise.all([a, b]), ["old", "old"]);
    assert.equal(await fetch(), "fresh");
  });
}

test("genre and year extraction is independent of payload entry order", () => {
  const filters = new FilterPreferences();
  const entries = new JsonParser().getWindowEntry(fixture);
  const expected = filters.extractOptionJSON(entries);
  assert(expected.genres.length > 0);
  assert(expected.year.length > 0);
  assert.deepEqual(filters.extractOptionJSON([...entries].reverse()), expected);
});

for (const broken of ["{broken", "null", '[{"id":5,"value":"wrong"}]']) {
  test(`invalid persisted filter snapshot recovers: ${broken}`, async () => {
    const filters = new FilterPreferences();
    state.set("last-filter-fetch", String(Date.now() / 1000));
    for (const key of [".genres", ".type", ".status", ".sort", ".year"]) state.set(key, "[]");
    state.set(".genres", broken);
    let loads = 0;
    const source = {
      requestManager: {
        parseFilters: async () => {
          loads++;
          return fixture;
        },
      },
    };
    await filters.populateFilter(source);
    assert.equal(loads, 1);
    assert(filters.getGenreFilter().length > 0);
    assert(filters.getYearFilter().length > 0);
    await filters.populateFilter(source);
    assert.equal(loads, 1);
  });
}

test("chapter lookup supports volumes and standalone chapters in the same manga", () => {
  const parser = new JsonParser();
  const pages = {
    volumes: [
      {
        volume: { slugFolder: "volume", id: "v", manga: "m" },
        chapters: [{ id: "a", slugFolder: "chapter", pages: ["a.jpg"] }],
      },
    ],
    singleChapters: [{ id: "b", slugFolder: "extra", manga: "m", pages: ["b.jpg"] }],
  };
  assert.equal(parser.findChapterData(pages, "a").chapterURL, "volume-v/chapter-a");
  assert.deepEqual(parser.findChapterData(pages, "b").pages, ["b.jpg"]);
  assert.equal(parser.findChapterData(pages, "missing"), null);
});

test("diagnostics reject long error pages and recover after failed filter refresh", async () => {
  let html = "<html>Access denied</html>".repeat(100);
  const source = {
    requestManager: {
      clearCache() {},
      fetchText: async () => html,
      parseFilters: async () => {
        throw new Error("offline");
      },
    },
  };
  const menu = new Forms(source);
  const maintenance = menu
    .getSections()[0]
    .items.find((row) => row.id === "maintenance_settings").form;
  const status = () => maintenance.getSections()[0].items.find((row) => row.id === "status").value;
  await maintenance.testSite();
  assert.match(status(), /Risposta inattesa/);
  html = fixture;
  await maintenance.testSite();
  assert.equal(status(), "MangaWorld raggiungibile");
  await maintenance.refreshFilters();
  assert.match(status(), /non riuscito/);
});
