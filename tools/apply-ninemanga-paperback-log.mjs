#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const filePath = "src/NineManga/main.ts";
let content = readFileSync(filePath, "utf8");

if (content.includes("[NineManga EN Diagnostic]")) {
  console.log("NineManga Paperback diagnostics already applied.");
  process.exit(0);
}

const helperAnchor = "type FetchedHtml = {\n  url: string;\n  html: string;\n};\n";
const helperBlock = helperAnchor + "\ntype NineMangaDebugPayload = Record<string, string | number | boolean | string[]>;\n\nfunction logNineMangaEnglishDiagnostic(label: string, payload: NineMangaDebugPayload): void {\n  try {\n    console.log(\"[NineManga EN Diagnostic] \" + label + \" \" + JSON.stringify(payload));\n  } catch {\n    console.log(\"[NineManga EN Diagnostic] \" + label);\n  }\n}\n\nfunction collectNineMangaHtmlDiagnostics(html: string): NineMangaDebugPayload {\n  const sourceLinks = [...html.matchAll(/href=[\\\"']([^\\\"']*(?:\\/go\\/ennm\\/|type=enninemanga|financemasterpro|sweettoothrecipes)[^\\\"']*)[\\\"']/giu)]\n    .map((match) => cleanText(match[1]))\n    .filter((href) => href.length > 0)\n    .slice(0, 10);\n\n  const scripts = [...html.matchAll(/<script\\b[^>]*src=[\\\"']([^\\\"']+)[\\\"'][^>]*>/giu)]\n    .map((match) => cleanText(match[1]))\n    .filter((src) => src.length > 0)\n    .slice(0, 10);\n\n  const variables = [\"book_id\", \"chapter_id\", \"list_num\", \"pre_page_url\", \"next_page_url\", \"all_imgs_url\"]\n    .map((name) => {\n      const match = html.match(new RegExp(\"\\\\bvar\\\\s+\" + name + \"\\\\s*=\\\\s*([^;]+);\", \"iu\"));\n      return match?.[1] ? name + \"=\" + cleanText(match[1]).slice(0, 200) : \"\";\n    })\n    .filter((value) => value.length > 0);\n\n  return {\n    bytes: html.length,\n    sourceGate: /Choose a source to start reading/iu.test(html),\n    hasPicBox: /pic_box|manga_pic|pic_download/iu.test(html),\n    hasMovietop: /movietop\\.cc/iu.test(html),\n    hasCloudflare: /Attention Required|challenge-platform|cf-chl|__CF\\$cv/iu.test(html),\n    sourceLinks,\n    scripts,\n    variables,\n  };\n}\n";

if (!content.includes(helperAnchor)) {
  throw new Error("Could not find FetchedHtml anchor in main.ts");
}
content = content.replace(helperAnchor, helperBlock);

const parseAnchor = "          const $ = cheerio.load(currentPage.html);\n          pages.push(...readerParser(currentPage.html, $, baseUrl));\n\n          if (pages.length === 0) {";
const parseReplacement = "          const $ = cheerio.load(currentPage.html);\n          const parsedPages = readerParser(currentPage.html, $, baseUrl);\n          pages.push(...parsedPages);\n          logNineMangaEnglishDiagnostic(\"reader-page\", {\n            url: currentPage.url,\n            parsedPages: parsedPages.length,\n            totalPages: pages.length,\n            ...collectNineMangaHtmlDiagnostics(currentPage.html),\n          });\n\n          if (pages.length === 0) {";

if (!content.includes(parseAnchor)) {
  throw new Error("Could not find English reader parser anchor in main.ts");
}
content = content.replace(parseAnchor, parseReplacement);

const resolverAnchor = "            const rebuiltReaderUrl = this.parseEnglishReaderUrlFromSourceLink(\n              $,\n              baseUrl,\n              chapter.sourceManga.mangaId,\n            );\n\n            if (rebuiltReaderUrl && !seenUrls.has(rebuiltReaderUrl)) {";
const resolverReplacement = "            const rebuiltReaderUrl = this.parseEnglishReaderUrlFromSourceLink(\n              $,\n              baseUrl,\n              chapter.sourceManga.mangaId,\n            );\n            logNineMangaEnglishDiagnostic(\"source-gate-resolver\", {\n              currentUrl: currentPage.url,\n              rebuiltReaderUrl,\n            });\n\n            if (rebuiltReaderUrl && !seenUrls.has(rebuiltReaderUrl)) {";

if (!content.includes(resolverAnchor)) {
  throw new Error("Could not find source gate resolver anchor in main.ts");
}
content = content.replace(resolverAnchor, resolverReplacement);

const failAnchor = "              } catch {\n                break;\n              }\n            }\n          }";
const failReplacement = "              } catch {\n                logNineMangaEnglishDiagnostic(\"source-gate-resolver-fetch-failed\", {\n                  rebuiltReaderUrl,\n                });\n                break;\n              }\n            }\n          }";

if (!content.includes(failAnchor)) {
  throw new Error("Could not find resolver fetch failure anchor in main.ts");
}
content = content.replace(failAnchor, failReplacement);

const returnAnchor = "      return {\n        id: chapter.chapterId,\n        mangaId: chapter.sourceManga.mangaId,\n        pages: dedupeStrings(pages),\n      };";
const returnReplacement = "      logNineMangaEnglishDiagnostic(\"final-result\", {\n        chapterId: chapter.chapterId,\n        mangaId: chapter.sourceManga.mangaId,\n        pages: dedupeStrings(pages).length,\n      });\n\n      return {\n        id: chapter.chapterId,\n        mangaId: chapter.sourceManga.mangaId,\n        pages: dedupeStrings(pages),\n      };";

if (!content.includes(returnAnchor)) {
  throw new Error("Could not find English final return anchor in main.ts");
}
content = content.replace(returnAnchor, returnReplacement);

writeFileSync(filePath, content);
console.log("Applied NineManga Paperback diagnostics to " + filePath);
