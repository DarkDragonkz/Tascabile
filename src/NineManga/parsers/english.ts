import type { NineMangaReaderParser } from "./common";
import { parsePicBoxImages } from "./common";

export const englishReaderParser: NineMangaReaderParser = (_html, $, baseUrl) => {
  return parsePicBoxImages($, baseUrl);
};
