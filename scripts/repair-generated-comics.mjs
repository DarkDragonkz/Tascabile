import { readFile, writeFile } from "node:fs/promises";

async function replaceLine(path, label, pattern, replacement) {
  const source = await readFile(path, "utf8");
  if (!pattern.test(source)) {
    throw new Error(`${label} not found in generated source.`);
  }
  await writeFile(path, source.replace(pattern, replacement));
}

await replaceLine(
  "src/ReadComicsOnline/settings.ts",
  "Read Comics Online URL normalization",
  /    const normalized = .*;\n/u,
  '    const normalized = value.trim().replace(/\\/+$/, "").replace(/^http:\\/\\//u, "https://");\n',
);
// BatCave's image helpers (finalize-comic-readers.mjs) no longer contain escaped regexes.

console.log("Repaired generated Comics regex escaping.");
