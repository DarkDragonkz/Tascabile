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

const SAFE_ID_REPLACEMENT = `  private toSafeId(slug: string): string {
    let safe = "";
    for (let index = 0; index < slug.length; index += 1) {
      const unit = slug.charCodeAt(index);
      let char = slug[index] ?? "";

      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = slug.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          char = slug.slice(index, index + 2);
          index += 1;
        } else {
          char = "\\uFFFD";
        }
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        char = "\\uFFFD";
      }

      if (/^[A-Za-z0-9._\\-@()[\\]%?#+=/&:]$/u.test(char)) {
        safe += char;
      } else {
        safe += encodeURIComponent(char);
      }
    }
    return safe;
  }`;

const SAFE_ID_TARGET = `  private toSafeId(slug: string): string {
    return slug.replace(/[^A-Za-z0-9._\\-@()[\\]%?#+=/&:]/g, (c) => {
      const enc = encodeURIComponent(c);
      if (enc !== c) return enc;
      return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    });
  }`;

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
    {
      label: "ReadComicOnline request HTTPS upgrade",
      target:
        "  override async interceptRequest(request: Request): Promise<Request> {\n    const baseUrl = this.getBaseUrl();",
      replacement:
        "  override async interceptRequest(request: Request): Promise<Request> {\n" +
        '    request.url = request.url.replace(/^http:\\/\\//u, "https://");\n' +
        '    const baseUrl = this.getBaseUrl().replace(/^http:\\/\\//u, "https://");',
    },
    {
      label: "ReadComicOnline base URL HTTPS normalization",
      target: "  get baseUrl(): string {\n    return getMirrorBaseUrl();\n  }",
      replacement:
        "  get baseUrl(): string {\n" +
        '    return getMirrorBaseUrl().replace(/^http:\\/\\//u, "https://");\n' +
        "  }",
    },
    {
      label: "ReadComicOnline tag ID sanitization",
      target: '          id: g.toLowerCase().replace(/\\s+/g, "-"),',
      replacement: '          id: this.toSafeId(g.toLowerCase().replace(/\\s+/g, "-")),',
    },
    {
      label: "ReadComicOnline decrypted image normalization",
      target: "    const pages = await this.decryptPages(combinedScripts, useServer2);",
      replacement:
        "    const decryptedPages = await this.decryptPages(combinedScripts, useServer2);\n" +
        "    const pages = decryptedPages\n" +
        "      .map((page) => this.absoluteUrl(page))\n" +
        "      .filter((page) => page.length > 0);",
    },
    {
      label: "ReadComicOnline absolute URL ATS normalization",
      target:
        '    if (s.startsWith("http")) return s;\n    return s.startsWith("/") ? `${this.baseUrl}${s}` : `${this.baseUrl}/${s}`;',
      replacement:
        '    if (s.startsWith("http://")) {\n' +
        '      const origin = s.replace(/^http:\\/\\//u, "");\n' +
        "      return `https://wsrv.nl/?url=${encodeURIComponent(origin)}&q=100`;\n" +
        "    }\n" +
        '    if (s.startsWith("https://")) return s;\n' +
        '    if (s.startsWith("//")) return `https:${s}`;\n' +
        '    return s.startsWith("/") ? `${this.baseUrl}${s}` : `${this.baseUrl}/${s}`;',
    },
    {
      label: "ReadComicOnline Unicode-safe IDs",
      target: SAFE_ID_TARGET,
      replacement: SAFE_ID_REPLACEMENT,
    },
  ]);

  await patchFile("src/ReadComicOnline/pbconfig.ts", [
    {
      label: "ReadComicOnline Tascabile version bump",
      target: '  version: "1.4.43.13",',
      replacement: '  version: "1.4.43.14",',
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
      label: "Batcave absolute URL ATS normalization",
      target:
        '    if (s.startsWith("http")) return s;\n    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;',
      replacement:
        '    if (s.startsWith("http://")) {\n' +
        '      const origin = s.replace(/^http:\\/\\//u, "");\n' +
        "      return `https://wsrv.nl/?url=${encodeURIComponent(origin)}&q=100`;\n" +
        "    }\n" +
        '    if (s.startsWith("https://")) return s;\n' +
        '    if (s.startsWith("//")) return `https:${s}`;\n' +
        '    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;',
    },
    {
      label: "Batcave Unicode-safe IDs",
      target: SAFE_ID_TARGET,
      replacement: SAFE_ID_REPLACEMENT,
    },
  ]);

  await patchFile("src/Batcave/pbconfig.ts", [
    {
      label: "Batcave Tascabile version bump",
      target: '  version: "1.4.9.1",',
      replacement: '  version: "1.4.9.3",',
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
      label: "MMRCMS absolute URL ATS normalization",
      target:
        '    if (!src.startsWith("http")) {\n      src = src.startsWith("/")\n        ? `${this.baseUrl}${src}`\n        : `${this.baseUrl}/${src}`;\n    }\n    return src;',
      replacement:
        '    if (src.startsWith("http://")) {\n' +
        '      const origin = src.replace(/^http:\\/\\//u, "");\n' +
        "      return `https://wsrv.nl/?url=${encodeURIComponent(origin)}&q=100`;\n" +
        "    }\n" +
        '    if (src.startsWith("https://")) return src;\n' +
        '    if (src.startsWith("//")) return `https:${src}`;\n' +
        '    return src.startsWith("/") ? `${this.baseUrl}${src}` : `${this.baseUrl}/${src}`;',
    },
    {
      label: "MMRCMS image URL ATS normalization",
      target:
        '    src = src.trim().replace(/#.*$/, "");\n    if (src && !src.startsWith("http")) {\n      src = src.startsWith("/")\n        ? `${this.baseUrl}${src}`\n        : `${this.baseUrl}/${src}`;\n    }\n    return src;',
      replacement: '    return this.absUrl(src.trim().replace(/#.*$/, ""));',
    },
    {
      label: "MMRCMS Unicode-safe IDs",
      target: SAFE_ID_TARGET,
      replacement: SAFE_ID_REPLACEMENT,
    },
  ]);

  await patchFile("src/ReadComicsOnline/pbconfig.ts", [
    {
      label: "Read Comics Online Tascabile version bump",
      target: '  version: "1.4.14.1",',
      replacement: '  version: "1.4.14.3",',
    },
  ]);
}

for (const [remotePath, localPath] of TARGETS) {
  await rm(localPath, { recursive: true, force: true });
  await walk(remotePath, localPath);
}

await applyCompatibilityPatches();
console.log(`Synced comic readers from ${UPSTREAM}@${REVISION}`);
