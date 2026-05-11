import type { CheerioAPI } from "cheerio";

import type { NineMangaReaderParser } from "./common";
import { italianReaderParser } from "./italian";

export type { NineMangaReaderParser } from "./common";
export { italianReaderParser } from "./italian";

function emptyEnglishReaderParser(
  _html: string,
  _$: CheerioAPI,
  _baseUrl: string,
): string[] {
  return [];
}

export function getNineMangaReaderParser(language: string): NineMangaReaderParser {
  switch (language) {
    case "eng":
      return emptyEnglishReaderParser;
    case "ita":
    case "esp":
    case "rus":
    case "deu":
    case "fra":
    case "br":
    default:
      return italianReaderParser;
  }
}
