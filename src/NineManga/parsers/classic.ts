import type { NineMangaReaderParser } from "./common";
import { dedupeStrings, parseAllImgsUrlArray, parsePicBoxImages, parseScriptImageUrls } from "./common";

export const classicReaderParser: NineMangaReaderParser = (html, $, baseUrl) => {
  return dedupeStrings([
    ...parsePicBoxImages($, baseUrl),
    ...parseAllImgsUrlArray(html, baseUrl),
    ...parseScriptImageUrls(html, baseUrl),
  ]);
};
