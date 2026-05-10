import type { CheerioAPI } from "cheerio";

import { parseAllImgsUrlArray, parsePicBoxImages } from "./common";

export function englishReaderParser(
  html: string,
  $: CheerioAPI,
  baseUrl: string,
): string[] {
  const pagesFromScript = parseAllImgsUrlArray(html, baseUrl);
  if (pagesFromScript.length > 0) return pagesFromScript;

  return parsePicBoxImages($, baseUrl);
}
