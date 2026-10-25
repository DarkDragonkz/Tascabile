import type { NineMangaReaderParser } from "./common";
import { classicReaderParser } from "./classic";

export const portugueseBrReaderParser: NineMangaReaderParser = (html, $, baseUrl) =>
  classicReaderParser(html, $, baseUrl);
