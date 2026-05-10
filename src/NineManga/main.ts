import {
  CloudflareError,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  Form,
  PaperbackInterceptor,
  Section,
  SelectRow,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type CloudflareBypassRequestProviding,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type PagedResults,
  type Request,
  type Response,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SourceManga,
  type TagSection,
} from "@paperback/types";
import type { SearchFilterValue } from "@paperback/types/lib/compat/0.8";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

const LANGUAGE_STATE_KEY = "ninemanga_language";
const DEFAULT_LANGUAGE = "ita";

const NINEMANGA_SITES = {
  eng: {
    title: "English",
    baseUrl: "https://www.ninemanga.com",
    languageCode: "en",
  },
  esp: {
    title: "Español",
    baseUrl: "https://es.ninemanga.com",
    languageCode: "es",
  },
  rus: {
    title: "Русский",
    baseUrl: "https://ru.ninemanga.com",
    languageCode: "ru",
  },
  deu: {
    title: "Deutsch",
    baseUrl: "https://de.ninemanga.com",
    languageCode: "de",
  },
  ita: {
    title: "Italiano",
    baseUrl: "https://it.ninemanga.com",
    languageCode: "it",
  },
  fra: {
    title: "Français",
    baseUrl: "https://fr.ninemanga.com",
    languageCode: "fr",
  },
  br: {
    title: "Português BR",
    baseUrl: "https://br.ninemanga.com",
    languageCode: "pt-BR",
  },
} as const;

type NineMangaLanguage = keyof typeof NINEMANGA_SITES;

type NineMangaMetadata = {
  page?: number;
  collectedIds?: string[];
};

type ParsedCard = {
  mangaId: string;
  title: string;
  imageUrl: string;
  subtitle?: string;
};

class NineMangaSettingsForm extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "ninemanga_language_settings",
          footer: "Seleziona il dominio NineManga usato da home, ricerca, dettagli e lettura.",
        },
        [
          SelectRow("ninemanga_language", {
            title: "Lingua NineManga",
            subtitle: "Default: Italiano",
            value: [(Application.getState(LANGUAGE_STATE_KEY) as string | undefined) ?? DEFAULT_LANGUAGE],
            options: Object.entries(NINEMANGA_SITES).map(([id, site]) => ({
              id,
              title: site.title,
            })),
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as NineMangaSettingsForm, "handleLanguageChange"),
          }),
        ],
      ),
    ];
  }

  async handleLanguageChange(value: string[]): Promise<void> {
    const language = value[0] ?? DEFAULT_LANGUAGE;
    Application.setState(language, LANGUAGE_STATE_KEY);
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }
}

class NineMangaInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    const baseUrl = getSelectedSite().baseUrl;
    request.headers = {
      ...request.headers,
      origin: baseUrl,
      referer: `${baseUrl}/`,
      "user-agent": await Application.getDefaultUserAgent(),
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.5",
    };
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    void request;
    void response;
    return data;
  }
}

class NineMangaExtension
  implements
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding,
    SettingsFormProviding,
    CloudflareBypassRequestProviding
{
  readonly requestManager = new NineMangaInterceptor("ninemanga-main");
  readonly cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new NineMangaSettingsForm();
  }

  async getCloudflareBypassRequest(): Promise<Request> {
    const baseUrl = getSelectedSite().baseUrl;
    return {
      url: baseUrl,
      method: "GET",
      headers: {
        referer: `${baseUrl}/`,
        origin: baseUrl,
        "user-agent": await Application.getDefaultUserAgent(),
      },
    } as Request;
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const language = getSelectedSite().title;
    return [
      {
        id: "updated_section",
        title: `Aggiornati · ${language}`,
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "popular_section",
        title: `Popolari · ${language}`,
        type: DiscoverSectionType.featured,
      },
      {
        id: "new_section",
        title: `Nuovi · ${language}`,
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: NineMangaMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const $ = await this.fetchCheerio({
      url: `${getSelectedSite().baseUrl}/`,
      method: "GET",
    } as Request);

    const cards = this.parseHomeSection($, section.id);
    const items = cards.map((card) => {
      if (section.type === DiscoverSectionType.featured) {
        return {
          type: "featuredCarouselItem" as const,
          mangaId: card.mangaId,
          title: card.title,
          imageUrl: card.imageUrl,
          supertitle: card.subtitle,
          contentRating: ContentRating.EVERYONE,
        };
      }

      return this.createSimpleItem(card.mangaId, card.imageUrl, card.title, card.subtitle);
    });

    void metadata;
    return { items, metadata: undefined };
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata: NineMangaMetadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const title = query.title.trim();
    if (!title) return { items: [] };

    const url = `${getSelectedSite().baseUrl}/search/?wd=${encodeURIComponent(title).replace(/%20/gu, "+")}${
      page > 1 ? `&page=${page}` : ""
    }`;
    const $ = await this.fetchCheerio({ url, method: "GET" } as Request);
    const items: SearchResultItem[] = [];

    $(".direlist .bookinfo").each((_, element) => {
      const unit = $(element);
      const titleLink = unit.find("a.bookname").first();
      const title = cleanText(titleLink.text());
      const mangaId = normalizeMangaId(titleLink.attr("href") ?? "");
      const imageUrl = normalizeUrl(unit.find("dt img").first().attr("src") ?? "", getSelectedSite().baseUrl);
      const subtitle = cleanText(unit.find("a.chaptername").first().text());

      if (!title || !mangaId) return;
      items.push({
        mangaId,
        title,
        subtitle,
        imageUrl,
        metadata: undefined,
      });
    });

    return {
      items,
      metadata: this.hasNextPage($) ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const baseUrl = getSelectedSite().baseUrl;
    const url = `${baseUrl}/${mangaId}${mangaId.includes("?") ? "&" : "?"}waring=1`;
    const $ = await this.fetchCheerio({ url, method: "GET" } as Request);

    const title = cleanText($(".ttline h1[itemprop='name']").first().text()) ||
      cleanText($("meta[property='og:title']").attr("content")) ||
      cleanText($(".bookintro .message li").first().find("span").text());
    const image = normalizeUrl(
      $(".bookintro .bookface img").first().attr("src") || $("meta[property='og:image']").attr("content") || "",
      baseUrl,
    );
    const synopsis = cleanText($(".bookintro p[itemprop='description']").first().text().replace(/^Sommario:\s*/iu, ""));
    const secondaryTitles = this.parseSecondaryTitles($);
    const author = cleanText($(".bookintro [itemprop='author']").first().text());
    const status = cleanText($(".bookintro li:contains('Stato') a.red").first().text()) || "Unknown";
    const genres = $(".bookintro li[itemprop='genre'] a")
      .toArray()
      .map((element) => cleanText($(element).text()))
      .filter((genre) => genre.length > 0);

    const tagGroups: TagSection[] = genres.length > 0
      ? [
          {
            id: "genres",
            title: "Genres",
            tags: genres.map((genre) => ({
              id: genre.toLowerCase().replace(/[^a-z0-9]+/giu, "-"),
              title: genre,
            })),
          },
        ]
      : [];

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles,
        thumbnailUrl: image,
        synopsis,
        author,
        artist: author,
        contentRating: ContentRating.EVERYONE,
        status,
        tagGroups,
        shareUrl: `${baseUrl}/${mangaId}`,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const baseUrl = getSelectedSite().baseUrl;
    const url = `${baseUrl}/${sourceManga.mangaId}${sourceManga.mangaId.includes("?") ? "&" : "?"}waring=1`;
    const $ = await this.fetchCheerio({ url, method: "GET" } as Request);
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    $(".sub_vol_ul li").each((_, element) => {
      const unit = $(element);
      const chapterLink = unit.find("a.chapter_list_a").first();
      const chapterId = normalizeChapterId(chapterLink.attr("href") ?? "");
      const title = cleanText(chapterLink.text()) || cleanText(chapterLink.attr("title"));
      const dateText = cleanText(unit.find("span").last().text());

      if (!chapterId || !title || seen.has(chapterId)) return;
      seen.add(chapterId);

      chapters.push({
        chapterId,
        title,
        sourceManga,
        chapNum: extractChapterNumber(title),
        publishDate: parseDate(dateText),
        langCode: getSelectedSite().languageCode,
      });
    });

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const baseUrl = getSelectedSite().baseUrl;
    const $ = await this.fetchCheerio({
      url: `${baseUrl}/${chapter.chapterId}`,
      method: "GET",
    } as Request);
    const pages: string[] = [];

    $("img.manga_pic").each((_, element) => {
      const pageUrl = normalizeUrl($(element).attr("src") ?? "", baseUrl);
      if (pageUrl && !pages.includes(pageUrl)) pages.push(pageUrl);
    });

    if (pages.length === 0) {
      $("a.pic_download").each((_, element) => {
        const pageUrl = normalizeUrl($(element).attr("href") ?? "", baseUrl);
        if (pageUrl && !pages.includes(pageUrl)) pages.push(pageUrl);
      });
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  getMangaShareUrl(mangaId: string): string {
    return `${getSelectedSite().baseUrl}/${mangaId}`;
  }

  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    for (const cookie of this.cookieStorageInterceptor.cookies) {
      this.cookieStorageInterceptor.deleteCookie(cookie);
    }

    for (const cookie of cookies) {
      if (cookie.expires && cookie.expires.getTime() <= Date.now()) continue;
      this.cookieStorageInterceptor.setCookie(cookie);
    }
  }

  private async fetchCheerio(request: Request): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest(request);
    const html = Application.arrayBufferToUTF8String(data);

    if (response.status === 503 || response.status === 403 || html.includes("cf-challenge")) {
      throw new CloudflareError({
        url: getSelectedSite().baseUrl,
        method: "GET",
        headers: {
          referer: `${getSelectedSite().baseUrl}/`,
          origin: getSelectedSite().baseUrl,
        },
      } as Request);
    }

    if (response.status === 404) {
      throw new Error("Content not found");
    }

    return cheerio.load(html);
  }

  private parseHomeSection($: CheerioAPI, sectionId: string): ParsedCard[] {
    const wantedTitle = sectionId === "updated_section" ? "Ultimi aggiornamenti Manga" : sectionId === "popular_section" ? "Popolare" : "Nuovo";
    const titleBlock = $(".ttline")
      .toArray()
      .find((element) => cleanText($(element).text()).includes(wantedTitle));

    if (!titleBlock) return [];

    const list = $(titleBlock).next("ul");
    const cards: ParsedCard[] = [];

    list.find("li").each((_, element) => {
      const unit = $(element);
      const titleLink = unit.find("a.show_book_desc").first();
      const image = unit.find("img").first();
      const mangaId = normalizeMangaId(titleLink.attr("href") ?? unit.find("a[href*='/manga/']").first().attr("href") ?? "");
      const title = cleanText(titleLink.text()) || cleanText(image.attr("alt"));
      const imageUrl = normalizeUrl(image.attr("src") ?? "", getSelectedSite().baseUrl);
      const subtitle = cleanText(unit.find("a[href*='/chapter/'] span").first().text()) || cleanText(unit.find("dl dt a").first().text());

      if (!title || !mangaId) return;
      cards.push({ mangaId, title, imageUrl, subtitle });
    });

    return dedupeCards(cards).slice(0, 24);
  }

  private parseSecondaryTitles($: CheerioAPI): string[] {
    const alternativeRow = $(".bookintro .message li")
      .toArray()
      .find((element) => cleanText($(element).find("b").first().text()).toLowerCase().includes("alternativa"));

    if (!alternativeRow) return [];

    const cloned = $(alternativeRow).clone();
    cloned.find("b").remove();
    return cleanText(cloned.text())
      .split(";")
      .map((title) => cleanText(title))
      .filter((title) => title.length > 0);
  }

  private hasNextPage($: CheerioAPI): boolean {
    return $("a:contains('Next'), a:contains('Successivo'), a[href*='page=']").length > 0;
  }

  private createSimpleItem(
    mangaId: string,
    imageUrl: string,
    title: string,
    subtitle?: string,
  ): DiscoverSectionItem {
    return {
      type: "simpleCarouselItem",
      mangaId,
      imageUrl,
      title,
      subtitle,
      metadata: undefined,
      contentRating: ContentRating.EVERYONE,
    };
  }
}

function getSelectedLanguage(): NineMangaLanguage {
  const stored = Application.getState(LANGUAGE_STATE_KEY) as string | undefined;
  return isNineMangaLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

function getSelectedSite(): (typeof NINEMANGA_SITES)[NineMangaLanguage] {
  return NINEMANGA_SITES[getSelectedLanguage()];
}

function isNineMangaLanguage(value: string | undefined): value is NineMangaLanguage {
  return value !== undefined && value in NINEMANGA_SITES;
}

function normalizeUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/")) return `${baseUrl}${trimmed}`;
  return `${baseUrl}/${trimmed}`;
}

function normalizeMangaId(value: string): string {
  return value
    .replace(/^https?:\/\/[^/]+\//iu, "")
    .replace(/^\/+|\/+$/gu, "")
    .split("?")[0]
    ?.trim() ?? "";
}

function normalizeChapterId(value: string): string {
  return value
    .replace(/^https?:\/\/[^/]+\//iu, "")
    .replace(/^\/+|\/+$/gu, "")
    .split("?")[0]
    ?.trim() ?? "";
}

function dedupeCards(cards: ParsedCard[]): ParsedCard[] {
  const seen = new Set<string>();
  const result: ParsedCard[] = [];
  for (const card of cards) {
    if (seen.has(card.mangaId)) continue;
    seen.add(card.mangaId);
    result.push(card);
  }
  return result;
}

function cleanText(value: string | undefined): string {
  return value?.replace(/\s+/gu, " ").trim() ?? "";
}

function parseDate(value: string): Date | undefined {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function extractChapterNumber(title: string): number {
  const numbers = title.match(/\d+(?:\.\d+)?/gu);
  if (!numbers || numbers.length === 0) return 0;
  return Number(numbers[numbers.length - 1]);
}

export const NineManga = new NineMangaExtension();
