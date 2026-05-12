import type { NineMangaReaderParser } from "./common";
import { classicReaderParser } from "./classic";

export const germanReaderParser: NineMangaReaderParser = (html, $, baseUrl) =>
  classicReaderParser(html, $, baseUrl);
