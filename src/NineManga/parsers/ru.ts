import type { NineMangaReaderParser } from "./common";
import { classicReaderParser } from "./classic";

export const russianReaderParser: NineMangaReaderParser = (html, $, baseUrl) =>
  classicReaderParser(html, $, baseUrl);
