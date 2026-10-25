import type { NineMangaReaderParser } from "./common";
import { classicReaderParser } from "./classic";

export const frenchReaderParser: NineMangaReaderParser = (html, $, baseUrl) =>
  classicReaderParser(html, $, baseUrl);
