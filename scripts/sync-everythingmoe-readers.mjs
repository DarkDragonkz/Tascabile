import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const upstreams = [
  {
    owner: "inkdex",
    repo: "general-extensions",
    commit: "88a75e4bc91feff0ad9d38bd78fbd9baf3e0ab9a",
    paths: [
      "src/Comix",
      "src/MangaDot",
      "src/Atsumaru",
      "src/MangaFire",
      "src/WeebCentral",
      "src/Mangago",
      "src/utils/state.ts",
    ],
  },
  {
    owner: "karrot0",
    repo: "KakarotExtension",
    commit: "aff276113a87383368e456e4c06902fae69df8a9",
    paths: ["src/Mangaball"],
  },
];

function matchesPath(filePath, configuredPath) {
  return filePath === configuredPath || filePath.startsWith(`${configuredPath}/`);
}

async function fetchChecked(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return response;
}

async function fetchTree(upstream) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const url = `https://api.github.com/repos/${upstream.owner}/${upstream.repo}/git/trees/${upstream.commit}?recursive=1`;
  return fetchChecked(url, { headers }).then((response) => response.json());
}

async function syncUpstream(upstream) {
  const tree = await fetchTree(upstream);
  if (tree.truncated) {
    throw new Error(`${upstream.owner}/${upstream.repo}: recursive Git tree was truncated`);
  }

  const files = tree.tree.filter(
    (entry) =>
      entry.type === "blob" && upstream.paths.some((configuredPath) => matchesPath(entry.path, configuredPath)),
  );

  if (files.length === 0) {
    throw new Error(`${upstream.owner}/${upstream.repo}: no configured files found`);
  }

  for (const configuredPath of upstream.paths) {
    await rm(path.join(root, configuredPath), { recursive: true, force: true });
  }

  await Promise.all(
    files.map(async (entry) => {
      const rawUrl = `https://raw.githubusercontent.com/${upstream.owner}/${upstream.repo}/${upstream.commit}/${entry.path}`;
      const response = await fetchChecked(rawUrl);
      const destination = path.join(root, entry.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await response.arrayBuffer()));
    }),
  );

  console.log(
    `Synced ${files.length} files from ${upstream.owner}/${upstream.repo}@${upstream.commit.slice(0, 8)}`,
  );
}

async function patchMangaballCompatibility() {
  const settingsPath = path.join(root, "src/Mangaball/forms/SettingsForm.ts");
  const settingsSource = await readFile(settingsPath, "utf8");
  const patchedSettings = settingsSource.replace(
    '  FormSectionElement,\n',
    '  type FormSectionElement,\n',
  );

  if (patchedSettings === settingsSource) {
    throw new Error("Could not apply MangaBall FormSectionElement type-only import patch");
  }
  await writeFile(settingsPath, patchedSettings);

  const searchPath = path.join(root, "src/Mangaball/forms/SearchForm.ts");
  const searchSource = await readFile(searchPath, "utf8");
  const patchedSearch = searchSource.replace(
    'import { ShowcaseForm } from "./ShowcaseForm";\n',
    "",
  );

  if (patchedSearch === searchSource) {
    throw new Error("Could not remove unused MangaBall ShowcaseForm import");
  }
  await writeFile(searchPath, patchedSearch);
}

async function ensureOniSagaIcon() {
  const iconPath = path.join(root, "src/OniSaga/static/icon.png");
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  await mkdir(path.dirname(iconPath), { recursive: true });
  await writeFile(iconPath, Buffer.from(pngBase64, "base64"));
}

for (const upstream of upstreams) {
  await syncUpstream(upstream);
}

await patchMangaballCompatibility();
await ensureOniSagaIcon();
