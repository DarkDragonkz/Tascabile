#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const filePath = "src/NineManga/main.ts";
let content = readFileSync(filePath, "utf8");

if (content.includes("source-gate-direct-fetch")) {
  console.log("NineManga source-gate direct fetch diagnostics already applied.");
  process.exit(0);
}

const anchor = `          if (pages.length === 0) {
            const rebuiltReaderUrl = this.parseEnglishReaderUrlFromSourceLink(
              $,
              baseUrl,
              chapter.sourceManga.mangaId,
            );`;

const replacement = `          if (pages.length === 0) {
            const sourceGateUrl = normalizeUrl(
              $("a[href*='/go/ennm/'], a[href*='type=enninemanga']").first().attr("href") ?? "",
              baseUrl,
            );

            if (sourceGateUrl && !seenUrls.has(sourceGateUrl)) {
              logNineMangaEnglishDiagnostic("source-gate-direct-fetch", {
                currentUrl: currentPage.url,
                sourceGateUrl,
              });

              try {
                const sourceHtml = await this.fetchHtml({ url: sourceGateUrl, method: "GET" } as Request);
                const source$ = cheerio.load(sourceHtml);
                const sourcePages = readerParser(sourceHtml, source$, baseUrl);
                pages.push(...sourcePages);
                seenUrls.add(sourceGateUrl);
                logNineMangaEnglishDiagnostic("source-gate-direct-fetch-result", {
                  sourceGateUrl,
                  parsedPages: sourcePages.length,
                  totalPages: pages.length,
                  ...collectNineMangaHtmlDiagnostics(sourceHtml),
                });

                if (pages.length > 0) break;
              } catch {
                logNineMangaEnglishDiagnostic("source-gate-direct-fetch-failed", {
                  sourceGateUrl,
                });
              }
            }

            const rebuiltReaderUrl = this.parseEnglishReaderUrlFromSourceLink(
              $,
              baseUrl,
              chapter.sourceManga.mangaId,
            );`;

if (!content.includes(anchor)) {
  throw new Error("Could not find source-gate anchor in main.ts");
}

content = content.replace(anchor, replacement);
writeFileSync(filePath, content);
console.log("Applied NineManga source-gate direct fetch diagnostics to " + filePath);
