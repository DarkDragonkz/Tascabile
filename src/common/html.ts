import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

export function textOrEmpty(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function attrOrEmpty(value: string | undefined): string {
  return value?.trim() ?? "";
}
