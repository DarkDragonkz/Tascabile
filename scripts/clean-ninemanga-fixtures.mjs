import fs from "node:fs";
import path from "node:path";

const INPUT_DIR = "tmp/ninemanga-view-source";
const OUTPUT_DIR = "fixtures/ninemanga";

const files = {
  "view-source_https___it.ninemanga.com.html": "home.html",
  "view-source_https___it.ninemanga.com_search__wd=One+Piece.html": "search-one-piece.html",
  "view-source_https___it.ninemanga.com_search__type=high.html": "advanced-search.html",
  "view-source_https___it.ninemanga.com_manga_One+Piece.html_waring=1.html":
    "manga-one-piece-waring.html",
  "view-source_https___it.ninemanga.com_chapter_One Piece_204555.html":
    "chapter-one-piece-204555.html",
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function decodeHtml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ");
}

function extractLineContent(viewSourceHtml) {
  const matches = [...viewSourceHtml.matchAll(/<td class="line-content">([\s\S]*?)<\/td>/g)];

  if (matches.length === 0) {
    return viewSourceHtml;
  }

  return matches
    .map((match) =>
      decodeHtml(
        match[1]
          .replace(/<span\b[^>]*>/g, "")
          .replace(/<\/span>/g, "")
          .replace(/<a\b[^>]*>/g, "")
          .replace(/<\/a>/g, ""),
      ),
    )
    .join("\n");
}

for (const [inputName, outputName] of Object.entries(files)) {
  const inputPath = path.join(INPUT_DIR, inputName);
  const outputPath = path.join(OUTPUT_DIR, outputName);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing input fixture: ${inputPath}`);
  }

  const source = fs.readFileSync(inputPath, "utf8");
  const cleaned = extractLineContent(source);

  fs.writeFileSync(outputPath, cleaned, "utf8");
  console.log(`Wrote ${outputPath}`);
}