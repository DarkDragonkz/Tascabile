import type { CheerioAPI } from "cheerio";

export type NineMangaReaderParser = (
  html: string,
  $: CheerioAPI,
  baseUrl: string,
) => string[];

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&#038;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#34;/gu, '"')
    .replace(/&#039;/gu, "'")
    .replace(/&#39;/gu, "'")
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

export function normalizeUrl(value: string, baseUrl: string): string {
  const trimmed = decodeHtmlEntities(value).trim();
  if (!trimmed || isPlaceholderImage(trimmed)) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/")) return `${baseUrl}${trimmed}`;
  return `${baseUrl}/${trimmed}`;
}

export function isPlaceholderImage(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.startsWith("data:image/") || normalized.includes("blank") || normalized.includes("placeholder");
}

export function isValidImageUrl(value: string): boolean {
  return /\.(?:webp|jpg|jpeg|png|gif)(?:\?|$)/iu.test(value);
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

export function parseAllImgsUrlArray(html: string, baseUrl: string): string[] {
  const match = html.match(/all_imgs_url\s*:\s*\[([\s\S]*?)\]/u);
  if (!match?.[1]) return [];

  return dedupeStrings(
    [...match[1].matchAll(/["']([^"']+)["']/gu)]
      .map((urlMatch) => normalizeUrl(urlMatch[1] ?? "", baseUrl))
      .filter(isValidImageUrl),
  );
}

export function parsePicBoxImages($: CheerioAPI, baseUrl: string): string[] {
  const pages: string[] = [];

  $("div.pic_box a.pic_download[href], div.pic_box .tool a[href]").each((_, element) => {
    const imageUrl = normalizeUrl($(element).attr("href") ?? "", baseUrl);
    if (isValidImageUrl(imageUrl) && !pages.includes(imageUrl)) pages.push(imageUrl);
  });

  if (pages.length > 0) return pages;

  $("div.pic_box img.manga_pic, section.mangaread-img img[src]").each((_, element) => {
    const imageUrl = normalizeUrl($(element).attr("src") ?? "", baseUrl);
    if (isValidImageUrl(imageUrl) && !pages.includes(imageUrl)) pages.push(imageUrl);
  });

  return pages;
}
