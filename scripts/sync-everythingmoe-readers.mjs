import { mkdir, rm, writeFile } from "node:fs/promises";
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

for (const upstream of upstreams) {
  await syncUpstream(upstream);
}
