/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */
/* Modifications Copyright © 2026 DarkDragonkz */

import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type DiscoverSectionItem,
  type PagedResults,
  type SearchResultItem,
  type SourceManga,
} from "@paperback/types";
import * as cheerio from "cheerio";

import type { MangaWorldGeneric } from "./main";
import type { MangaMetadata } from "./models";
import { isMigratedAdultGenreHidden, normalizeFilterValue } from "./preferences";
import { tags, types } from "./utils";

type HtmlCard = {
  id: string;
  title: string;
  image: string;
  tags: string[];
  tagTitles: string[];
  authors: string;
  type: string;
};

function normalizeUrl(source: MangaWorldGeneric, rawUrl: string): string {
  const value = rawUrl.trim().replace(/\\\//gu, "/");
  if (!value) return "";
  if (/^https?:\/\//u.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `${source.base_url.replace(/\/+$/u, "")}/${value.replace(/^\/+/, "")}`;
}

function hidden(card: HtmlCard): boolean {
  return (
    tags.blacklistedTags(card.tags) ||
    card.tags.some((tag) => isMigratedAdultGenreHidden(tag)) ||
    (card.type.length > 0 && types.blacklistedType(card.type))
  );
}

function parseCards(html: string, source: MangaWorldGeneric): HtmlCard[] {
  const $ = cheerio.load(html);
  const items: HtmlCard[] = [];
  const seen = new Set<string>();

  $("a[href*='/manga/']").each((_, element) => {
    const link = $(element);
    const href = link.attr("href") ?? "";
    if (href.includes("/read/")) return;
    const id = href.match(/\/manga\/(\d+\/[^/?#]+)/u)?.[1];
    if (!id || seen.has(id)) return;

    const container = link.closest("article, li, [class*='manga'], [class*='card'], [class*='item']");
    const scope = container.length > 0 ? container.first() : link.parent();
    const linkImage = link.find("img").first();
    const imageElement = linkImage.length > 0 ? linkImage : scope.find("img").first();
    const image = normalizeUrl(
      source,
      imageElement.attr("data-src") ??
        imageElement.attr("data-lazy-src") ??
        imageElement.attr("src") ??
        "",
    );
    const title =
      imageElement.attr("alt")?.trim() ||
      link.attr("title")?.trim() ||
      scope.find("h1, h2, h3, h4, [class*='title']").first().text().replace(/\s+/gu, " ").trim() ||
      link.text().replace(/\s+/gu, " ").trim();
    if (!title || title.toLowerCase() === "leggi!") return;

    const tagMap = new Map<string, string>();
    scope
      .find("a[href*='genre='], a[href*='/genre/'], a[href*='/generi/']")
      .each((_, tagElement) => {
        const tagTitle = $(tagElement).text().trim();
        if (tagTitle) tagMap.set(normalizeFilterValue(tagTitle), tagTitle);
      });
    const authors = scope
      .find("a[href*='author='], a[href*='/author/']")
      .map((_, authorElement) => $(authorElement).text().trim())
      .get()
      .filter(Boolean)
      .join(", ");
    const type = scope.find("a[href*='type='], a[href*='/type/']").first().text().trim();

    seen.add(id);
    items.push({
      id,
      title,
      image,
      tags: [...tagMap.keys()],
      tagTitles: [...tagMap.values()],
      authors,
      type,
    });
  });

  return items;
}

function contentRating(source: MangaWorldGeneric, card: HtmlCard): ContentRating {
  if (source.defaultContentRating === ContentRating.ADULT) return ContentRating.ADULT;
  return tags.getRating(card.tagTitles.length > 0 ? card.tagTitles : card.tags);
}

function hasNextPage(html: string, currentPage: number): boolean {
  const $ = cheerio.load(html);
  const nextPage = currentPage + 1;
  return (
    $("a[rel='next']").length > 0 ||
    $("a")
      .filter((_, element) => {
        const href = $(element).attr("href") ?? "";
        const text = $(element).text().trim().toLowerCase();
        return href.includes(`page=${nextPage}`) || text === "successivo" || text === "next";
      })
      .length > 0
  );
}

export function parseSearchHtml(
  html: string,
  source: MangaWorldGeneric,
  metadata: MangaMetadata | undefined,
  excluded: { generi: string[]; tipi: string[] },
): PagedResults<SearchResultItem> {
  const page = metadata?.page ?? 1;
  const cards = parseCards(html, source).filter(
    (card) =>
      !hidden(card) &&
      !tags.excludedTags(card.tags, excluded.generi) &&
      !types.excludedTypes(card.type, excluded.tipi),
  );
  const items = cards.map(
    (card): SearchResultItem => ({
      mangaId: card.id,
      imageUrl: card.image,
      title: card.title,
      subtitle: card.authors || card.type,
      contentRating: contentRating(source, card),
    }),
  );
  return {
    items,
    metadata: hasNextPage(html, page) && items.length > 0 ? { page: page + 1 } : undefined,
  };
}

export function parseSimpleDiscoverHtml(
  html: string,
  source: MangaWorldGeneric,
  metadata: MangaMetadata | undefined,
): PagedResults<DiscoverSectionItem> {
  const page = metadata?.page ?? 1;
  const cards = parseCards(html, source).filter((card) => !hidden(card));
  const items: DiscoverSectionItem[] = cards.map((card) => ({
    type: "simpleCarouselItem",
    mangaId: card.id,
    imageUrl: card.image,
    title: card.title,
    subtitle: card.authors || card.type,
    contentRating: contentRating(source, card),
  }));
  return {
    items,
    metadata: hasNextPage(html, page) && items.length > 0 ? { page: page + 1 } : undefined,
  };
}

export function parseHeroDiscoverHtml(
  html: string,
  source: MangaWorldGeneric,
  mode: "featured" | "prominent",
): PagedResults<DiscoverSectionItem> {
  const cards = parseCards(html, source)
    .filter((card) => !hidden(card))
    .slice(0, 20);
  return {
    items: cards.map((card): DiscoverSectionItem => {
      if (mode === "featured") {
        return {
          type: "featuredCarouselItem",
          mangaId: card.id,
          imageUrl: card.image,
          title: card.title,
          supertitle: card.type || undefined,
          contentRating: contentRating(source, card),
        };
      }
      return {
        type: "prominentCarouselItem",
        mangaId: card.id,
        imageUrl: card.image,
        title: card.title,
        subtitle: card.authors || card.type,
        contentRating: contentRating(source, card),
      };
    }),
  };
}

function collectLinkText($: cheerio.CheerioAPI, hrefParts: string[]): string {
  return $("a")
    .filter((_, element) => {
      const href = $(element).attr("href") ?? "";
      return hrefParts.some((part) => href.includes(part));
    })
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(", ");
}

export function parseMangaDetailsHtml(
  html: string,
  mangaId: string,
  shareUrl: string,
  source: MangaWorldGeneric,
): SourceManga {
  const $ = cheerio.load(html);
  const primaryTitle =
    $("h1").first().text().trim() ||
    $("meta[property='og:title']").attr("content")?.trim() ||
    "MangaWorld";
  const thumbnailUrl = normalizeUrl(
    source,
    $("meta[property='og:image']").attr("content") ??
      $("img[src*='cdn.mangaworld']").first().attr("src") ??
      "",
  );
  const synopsis =
    $(".trama, .manga-trama, .description, .plot, [class*='trama']").first().text().trim() ||
    $("meta[name='description']").attr("content")?.trim() ||
    "";

  const genreMap = new Map<string, string>();
  $("a[href*='genre='], a[href*='/genre/'], a[href*='/generi/']").each((_, element) => {
    const title = $(element).text().trim();
    if (title) genreMap.set(normalizeFilterValue(title), title);
  });
  const genreTitles = [...genreMap.values()];
  const secondaryTitlesMatch = $("body").text().match(/Titoli alternativi:\s*([^\n]+)/iu);
  const secondaryTitles = (secondaryTitlesMatch?.[1] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const type = collectLinkText($, ["type=", "/type/"]);

  return {
    mangaId,
    mangaInfo: {
      primaryTitle,
      secondaryTitles,
      thumbnailUrl,
      synopsis,
      author: collectLinkText($, ["author=", "/author/"]),
      artist: collectLinkText($, ["artist=", "/artist/"]),
      status: collectLinkText($, ["status=", "/status/"]) || "Unknown",
      contentRating:
        source.defaultContentRating === ContentRating.ADULT
          ? ContentRating.ADULT
          : tags.getRating(genreTitles),
      tagGroups:
        genreTitles.length > 0
          ? [
              {
                id: "genres",
                title: "Generi",
                tags: genreTitles.map((title) => ({
                  id: normalizeFilterValue(title),
                  title,
                })),
              },
            ]
          : [],
      additionalInfo: type ? { type } : undefined,
      shareUrl,
    },
  };
}

function parseItalianDate(value: string): Date | undefined {
  const months: Record<string, number> = {
    gennaio: 0,
    febbraio: 1,
    marzo: 2,
    aprile: 3,
    maggio: 4,
    giugno: 5,
    luglio: 6,
    agosto: 7,
    settembre: 8,
    ottobre: 9,
    novembre: 10,
    dicembre: 11,
  };
  const match = value
    .toLowerCase()
    .match(
      /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/u,
    );
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  const month = months[match[2]];
  if (month === undefined) return undefined;
  return new Date(Number(match[3]), month, Number(match[1]));
}

export function parseChaptersHtml(html: string, sourceManga: SourceManga): Chapter[] {
  const $ = cheerio.load(html);
  const chapters: Chapter[] = [];
  const seen = new Set<string>();

  $("a[href*='/read/']").each((_, element) => {
    const link = $(element);
    const chapterId = (link.attr("href") ?? "").match(/\/read\/([^/?#]+)/u)?.[1];
    if (!chapterId || seen.has(chapterId)) return;
    seen.add(chapterId);
    const title = link.text().replace(/\s+/gu, " ").trim();
    const chapterNumber = title.match(/(?:capitolo|chapter)\s*([0-9]+(?:\.[0-9]+)?)/iu)?.[1];
    const parentText = link.closest("li, tr, article, div").first().text().replace(/\s+/gu, " ");
    const publishDate = parseItalianDate(parentText);
    chapters.push({
      chapterId,
      sourceManga,
      langCode: "it",
      chapNum: Number(chapterNumber ?? 0),
      title: title || `Capitolo ${chapterNumber ?? ""}`.trim(),
      ...(publishDate ? { publishDate } : {}),
    });
  });

  return chapters;
}

export function parseChapterDetailsHtml(
  html: string,
  chapter: Chapter,
  source: MangaWorldGeneric,
): ChapterDetails {
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $("img").each((_, element) => {
    const image = $(element);
    for (const attribute of ["data-src", "data-lazy-src", "src"]) {
      const value = image.attr(attribute);
      if (value) candidates.push(normalizeUrl(source, value));
    }
  });
  $("script").each((_, element) => {
    const script = $(element).html() ?? "";
    const matches =
      script.match(/https?:\\?\/\\?\/cdn\.mangaworld\.(?:mx|in)[^"'\s<]+/gu) ?? [];
    for (const match of matches) candidates.push(normalizeUrl(source, match));
  });
  const unique = [...new Set(candidates.filter(Boolean))];
  const chapterPages = unique.filter((url) => url.includes("/chapters/"));
  const pages =
    chapterPages.length > 0
      ? chapterPages
      : unique.filter((url) => /cdn\.mangaworld\.(?:mx|in)/u.test(url));
  return {
    id: chapter.chapterId,
    mangaId: chapter.sourceManga.mangaId,
    pages,
  };
}
