import type { NineMangaReaderParser } from "./common";
import { classicReaderParser } from "./classic";

export const spanishReaderParser: NineMangaReaderParser = (html, $, baseUrl) =>
  classicReaderParser(html, $, baseUrl);
