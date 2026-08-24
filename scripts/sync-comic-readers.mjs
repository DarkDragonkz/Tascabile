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
  const url =
    item.download_url ?? `https://raw.githubusercontent.com/${UPSTREAM}/${REVISION}/${item.path}`;
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

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const { label, target, replacement } of replacements) {
    if (!source.includes(target)) {
      throw new Error(`${label} changed upstream; review the pinned source before building.`);
    }
    source = source.replace(target, replacement);
  }
  await writeFile(path, source);
}

async function applyCompatibilityPatches() {
  await patchFile("src/ReadComicOnline/main.ts", [
    {
      label: "ReadComicOnline eval hook",
      target: "      const result = eval(wrappedScript) as string;",
      replacement:
        "      // eslint-disable-next-line no-eval -- Required by the upstream reader decrypt routine.\n" +
        "      const result = eval(wrappedScript) as string;",
    },
  ]);

  await patchFile("src/Batcave/main.ts", [
    {
      label: "Batcave request HTTPS upgrade",
      target:
        "  override async interceptRequest(request: Request): Promise<Request> {\n    request.headers = {",
      replacement:
        "  override async interceptRequest(request: Request): Promise<Request> {\n" +
        '    request.url = request.url.replace(/^http:\\/\\//u, "https://");\n' +
        "    request.headers = {",
    },
    {
      label: "Batcave tag ID sanitization",
      target: '          id: g.toLowerCase().replace(/\\s+/g, "-"),',
      replacement: '          id: this.toSafeId(g.toLowerCase().replace(/\\s+/g, "-")),',
    },
    {
      label: "Batcave chapter image normalization",
      target:
        '      pages.push(\n        trimmed.startsWith("http") ? trimmed : `${BASE_URL}${trimmed}`,\n      );',
      replacement: "      pages.push(this.absoluteUrl(trimmed));",
    },
    {
      label: "Batcave absolute URL HTTPS normalization",
      target:
        '    if (s.startsWith("http")) return s;\n    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;',
      replacement:
        '    if (s.startsWith("http://")) return s.replace(/^http:\\/\\//u, "https://");\n' +
        '    if (s.startsWith("https://")) return s;\n' +
        '    if (s.startsWith("//")) return `https:${s}`;\n' +
        '    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;',
    },
  ]);

  await patchFile("src/Batcave/pbconfig.ts", [
    {
      label: "Batcave Tascabile version bump",
      target: '  version: "1.4.9.1",',
      replacement: '  version: "1.4.9.2",',
    },
  ]);

  await patchFile("src/utils/mmrcms/template.ts", [
    {
      label: "MMRCMS request HTTPS upgrade",
      target:
        "  override async interceptRequest(request: Request): Promise<Request> {\n    const baseUrl = this.getBaseUrl();",
      replacement:
        "  override async interceptRequest(request: Request): Promise<Request> {\n" +
        '    request.url = request.url.replace(/^http:\\/\\//u, "https://");\n' +
        "    const baseUrl = this.getBaseUrl();",
    },
    {
      label: "MMRCMS base URL HTTPS normalization",
      target:
        "  get baseUrl(): string {\n    return getBaseUrlOverride(this.sourceName) ?? this.defaultBaseUrl;\n  }",
      replacement:
        "  get baseUrl(): string {\n" +
        "    const configured = getBaseUrlOverride(this.sourceName) ?? this.defaultBaseUrl;\n" +
        '    return configured.replace(/^http:\\/\\//u, "https://");\n' +
        "  }",
    },
    {
      label: "MMRCMS tag ID sanitization",
      target: '          id: g.toLowerCase().replace(/\\s+/g, "-"),',
      replacement: '          id: this.toSafeId(g.toLowerCase().replace(/\\s+/g, "-")),',
    },
    {
      label: "MMRCMS absolute URL HTTPS normalization",
      target:
        '    if (!src.startsWith("http")) {\n      src = src.startsWith("/")\n        ? `${this.baseUrl}${src}`\n        : `${this.baseUrl}/${src}`;\n    }\n    return src;',
      replacement:
        '    if (src.startsWith("http://")) return src.replace(/^http:\\/\\//u, "https://");\n' +
        '    if (src.startsWith("https://")) return src;\n' +
        '    if (src.startsWith("//")) return `https:${src}`;\n' +
        '    return src.startsWith("/") ? `${this.baseUrl}${src}` : `${this.baseUrl}/${src}`;',
    },
    {
      label: "MMRCMS image URL HTTPS normalization",
      target:
        '    src = src.trim().replace(/#.*$/, "");\n    if (src && !src.startsWith("http")) {\n      src = src.startsWith("/")\n        ? `${this.baseUrl}${src}`\n        : `${this.baseUrl}/${src}`;\n    }\n    return src;',
      replacement: '    return this.absUrl(src.trim().replace(/#.*$/, ""));',
    },
  ]);

  await patchFile("src/ReadComicsOnline/pbconfig.ts", [
    {
      label: "Read Comics Online Tascabile version bump",
      target: '  version: "1.4.14.1",',
      replacement: '  version: "1.4.14.2",',
    },
  ]);
}

for (const [remotePath, localPath] of TARGETS) {
  await rm(localPath, { recursive: true, force: true });
  await walk(remotePath, localPath);
}

await applyCompatibilityPatches();
console.log(`Synced comic readers from ${UPSTREAM}@${REVISION}`);
