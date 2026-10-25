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

await replaceLine(
  "src/Batcave/main.ts",
  "BatCave HTTP page URL normalization",
  /      const origin = value\.replace\(.*\);\n/u,
  '      const origin = value.replace(/^http:\\/\\//u, "");\n',
);

await replaceLine(
  "src/Batcave/main.ts",
  "BatCave Latest cover URL normalization",
  /    const origin = direct\.replace\(.*\);\n/u,
  '    const origin = direct.replace(/^https?:\\/\\//u, "");\n',
);

console.log("Repaired generated Comics regex escaping.");
