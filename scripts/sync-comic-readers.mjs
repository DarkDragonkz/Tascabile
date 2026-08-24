import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const UPSTREAM = "Nicartjay/PaperbackExt";
const REVISION = "cf43397bb1b90521629291599cee312fcf30f0f5";
const TARGETS = [
  ["src/Batcave", "src/Batcave"],
  ["src/ReadComicOnline", "src/ReadComicOnline"],
  ["src/ReadComicsOnline", "src/ReadComicsOnline"],
  ["src/utils/mmrcms", "src/utils/mmrcms"],
];

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Tascabile-comic-sync",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${url}`);
  return response.json();
}

async function writeRemoteFile(item, destination) {
  const url = item.download_url ?? `https://raw.githubusercontent.com/${UPSTREAM}/${REVISION}/${item.path}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Download ${response.status}: ${url}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function walk(remotePath, localPath) {
  const apiUrl = `https://api.github.com/repos/${UPSTREAM}/contents/${remotePath}?ref=${REVISION}`;
  const entries = await getJson(apiUrl);
  if (!Array.isArray(entries)) throw new Error(`Expected directory listing for ${remotePath}`);

  for (const item of entries) {
    const child = join(localPath, item.name);
    if (item.type === "dir") await walk(item.path, child);
    if (item.type === "file") await writeRemoteFile(item, child);
  }
}

async function applyCompatibilityPatches() {
  const rcoPath = "src/ReadComicOnline/main.ts";
  const source = await readFile(rcoPath, "utf8");
  const target = "      const result = eval(wrappedScript) as string;";
  if (!source.includes(target)) {
    throw new Error(
      "ReadComicOnline eval hook changed upstream; review the pinned source before building.",
    );
  }
  await writeFile(
    rcoPath,
    source.replace(
      target,
      "      // eslint-disable-next-line no-eval -- Required by the upstream reader decrypt routine.\n" +
        target,
    ),
  );
}

for (const [remotePath, localPath] of TARGETS) {
  await rm(localPath, { recursive: true, force: true });
  await walk(remotePath, localPath);
}

await applyCompatibilityPatches();
console.log(`Synced comic readers from ${UPSTREAM}@${REVISION}`);
