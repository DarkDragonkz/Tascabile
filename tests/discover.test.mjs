import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "rolldown";

await mkdir("node_modules/.cache", { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/tascabile-discover-"));
after(() => rm(directory, { recursive: true, force: true }));
await build({
  input: { discover: "src/common/discover.ts" },
  external: ["@paperback/types"],
  output: { dir: directory, format: "esm", entryFileNames: "[name].mjs" },
});
const { infoItems, relativeDateIt, shortSummary } = await import(
  pathToFileURL(`${directory}/discover.mjs`).href
);

await test("info items keep at most two non-empty badges", () => {
  assert.equal(infoItems({ symbol: "a", text: " " }, undefined), undefined);
  assert.deepEqual(infoItems({ symbol: "a", text: " Manga " }), [{ symbol: "a", text: "Manga" }]);
  assert.equal(
    infoItems({ symbol: "a", text: "1" }, { symbol: "b", text: "2" }, { symbol: "c", text: "3" })
      .length,
    2,
  );
});

await test("relative Italian dates", () => {
  const now = new Date(2026, 9, 25, 18).getTime();
  assert.equal(relativeDateIt(new Date(2026, 9, 25, 1), now), "Oggi");
  assert.equal(relativeDateIt(new Date(2026, 9, 24, 23), now), "Ieri");
  assert.equal(relativeDateIt(new Date(2026, 9, 21), now), "4 giorni fa");
  assert.equal(relativeDateIt(new Date(2026, 8, 3), now), "3 set 2026");
  assert.equal(relativeDateIt(new Date(2026, 9, 27), now), undefined);
  assert.equal(relativeDateIt(new Date("invalid"), now), undefined);
});

await test("summaries are cut on a word boundary", () => {
  assert.equal(shortSummary("  breve  testo "), "breve testo");
  const long = shortSummary("parola ".repeat(60), 40);
  assert.equal(long, "parola parola parola parola parola…");
  assert.equal(shortSummary(undefined), undefined);
});
