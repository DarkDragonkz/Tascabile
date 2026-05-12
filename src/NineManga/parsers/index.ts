import type { NineMangaReaderParser } from "./common";
import { englishReaderParser } from "./english";
import { frenchReaderParser } from "./fr";
import { germanReaderParser } from "./de";
import { italianReaderParser } from "./italian";
import { portugueseBrReaderParser } from "./ptBr";
import { russianReaderParser } from "./ru";
import { spanishReaderParser } from "./es";

export type { NineMangaReaderParser } from "./common";
export { englishReaderParser } from "./english";
export { frenchReaderParser } from "./fr";
export { germanReaderParser } from "./de";
export { italianReaderParser } from "./italian";
export { portugueseBrReaderParser } from "./ptBr";
export { russianReaderParser } from "./ru";
export { spanishReaderParser } from "./es";

export function getNineMangaReaderParser(language: string): NineMangaReaderParser {
  switch (language) {
    case "eng":
      return englishReaderParser;
    case "esp":
      return spanishReaderParser;
    case "rus":
      return russianReaderParser;
    case "deu":
      return germanReaderParser;
    case "fra":
      return frenchReaderParser;
    case "br":
      return portugueseBrReaderParser;
    case "ita":
    default:
      return italianReaderParser;
  }
}
