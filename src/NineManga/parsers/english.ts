import type { NineMangaReaderParser } from "./common";
import { parseAllImgsUrlArray, parsePicBoxImages, dedupeStrings } from "./common";

export const englishReaderParser: NineMangaReaderParser = (html, $, baseUrl) => {
  return dedupeStrings([
    ...parsePicBoxImages($, baseUrl),
    ...parseAllImgsUrlArray(html, baseUrl),
  ]);
};
