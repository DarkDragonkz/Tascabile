import type { NineMangaReaderParser } from "./common";
import { englishReaderParser } from "./english";
import { italianReaderParser } from "./italian";

export type { NineMangaReaderParser } from "./common";
export { englishReaderParser } from "./english";
export { italianReaderParser } from "./italian";

export function getNineMangaReaderParser(language: string): NineMangaReaderParser {
  switch (language) {
    case "eng":
      return englishReaderParser;
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
