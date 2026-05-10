import type { CheerioAPI } from "cheerio";

import { parsePicBoxImages } from "./common";

export function italianReaderParser(
  _html: string,
  $: CheerioAPI,
  baseUrl: string,
): string[] {
  return parsePicBoxImages($, baseUrl);
}
