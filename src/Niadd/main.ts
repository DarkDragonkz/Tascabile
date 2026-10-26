import {
  BasicRateLimiter,
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
  type Metadata,
  type PagedResults,
  type Request,
  type Response,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SourceManga,
} from "@paperback/types";

import {
  INFO_SYMBOLS,
  detailInfo,
  infoItems,
  relativeDateIt,
  shortSummary,
} from "../common/discover";
import {
  DEFAULT_LANGUAGE,
  NIADD_LANGUAGES,
  decodeMangaId,
  dedupeImages,
  encodeMangaId,
  isChallengePage,
  isNiaddLanguage,
  latestChapterLabel,
  parseChapters,
  parseMangaDetails,
  parseMangaList,
  parseReaderPage,
  readerUrl,
  type NiaddCard,
  type NiaddLanguage,
} from "./parsers";

// Guards against a malformed page selector looping over unrelated pages.
const MAX_READER_PAGES = 60;
const LANGUAGE_STATE_KEY = "niadd.language";
const NIADD_HOST = /^https:\/\/(?:it|br|fr|ru)\.niadd\.com\//u;

type NiaddMetadata = {
  page?: number;
  firstId?: string;
};

const LISTS: Record<string, string> = {
  niadd_updated: "New-Update",
  niadd_popular: "Hot-Manga",
  niadd_new: "New-Manga",
};

function selectedLanguage(): NiaddLanguage {
  const stored = Application.getState(LANGUAGE_STATE_KEY);
  return isNiaddLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

class NiaddSettingsForm extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "niadd_language",
          footer:
            "Lingua usata da Home e ricerca. Le serie già in libreria restano nella loro lingua originale.",
        },
        [
          SelectRow("language", {
            title: "Lingua del catalogo",
            value: [selectedLanguage()],
            options: Object.entries(NIADD_LANGUAGES).map(([id, language]) => ({
              id,
              title: language.label,
            })),
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as NiaddSettingsForm, "updateLanguage"),
          }),
        ],
      ),
    ];
  }

  async updateLanguage(value: string[]): Promise<void> {
    Application.setState(
      isNiaddLanguage(value[0]) ? value[0] : DEFAULT_LANGUAGE,
      LANGUAGE_STATE_KEY,
    );
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
}

class NiaddInterceptor extends PaperbackInterceptor {
  private lastBypassPromptAt = 0;

  markBypassCompleted(): void {
    this.lastBypassPromptAt = 0;
  }

  override async interceptRequest(request: Request): Promise<Request> {
    request.url = request.url.replace(/^http:\/\//u, "https://");
    // Site pages are their own origin; CDN images use the origin of the active catalogue.
    const origin = NIADD_HOST.test(request.url)
      ? originOf(request.url)
      : NIADD_LANGUAGES[selectedLanguage()].baseUrl;
    request.headers = {
      ...request.headers,
      referer: `${origin}/`,
      "user-agent": await Application.getDefaultUserAgent(),
    };
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (!NIADD_HOST.test(request.url)) return data;
    const challenged =
      response.headers?.["cf-mitigated"] === "challenge" ||
      ((response.status === 403 || response.status === 503) &&
        isChallengePage(Application.arrayBufferToUTF8String(data)));
    if (!challenged) return data;

    // One banner at a time: parallel Home sections would otherwise each open one.
    if (Date.now() - this.lastBypassPromptAt < 30_000) {
      throw new Error("Verifica Cloudflare già in corso. Completa il banner aperto e riprova.");
    }
    this.lastBypassPromptAt = Date.now();
    throw new CloudflareError({
      url: originOf(request.url),
      method: "GET",
      headers: { "user-agent": await Application.getDefaultUserAgent() },
    });
  }
}

class NiaddExtension
  implements
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding,
    SettingsFormProviding,
    CloudflareBypassRequestProviding
{
  readonly requestManager = new NiaddInterceptor("niadd-main");
  readonly cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  readonly rateLimiter = new BasicRateLimiter("niadd-rate", {
    numberOfRequests: 4,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new NiaddSettingsForm();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const language = NIADD_LANGUAGES[selectedLanguage()].label;
    return [
      {
        id: "niadd_updated",
        title: "Ultimi aggiornamenti",
        subtitle: `Capitoli appena pubblicati · ${language}`,
        type: DiscoverSectionType.chapterUpdates,
      },
      {
        id: "niadd_popular",
        title: "Più popolari",
        subtitle: `Le serie più lette · ${language}`,
        type: DiscoverSectionType.featured,
      },
      {
        id: "niadd_new",
        title: "Nuove serie",
        subtitle: `Ultime serie aggiunte · ${language}`,
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const list = LISTS[section.id];
    if (!list) return { items: [] };
    const language = selectedLanguage();
    const { baseUrl } = NIADD_LANGUAGES[language];
    const cards = parseMangaList(await this.fetchHtml(listUrl(baseUrl, list)), baseUrl);

    const items = cards.flatMap((card): DiscoverSectionItem[] => {
      const mangaId = encodeMangaId(language, card.mangaId);
      if (section.id === "niadd_updated") {
        if (!card.latestChapterId) return [];
        return [
          {
            type: "chapterUpdatesCarouselItem",
            mangaId,
            chapterId: card.latestChapterId,
            imageUrl: card.imageUrl,
            title: card.title,
            subtitle: latestChapterLabel(card.latestChapterTitle, language),
            publishDate: card.updatedAt,
            contentRating: ContentRating.EVERYONE,
          },
        ];
      }
      if (section.id === "niadd_popular") {
        return [
          {
            type: "featuredCarouselItem",
            mangaId,
            imageUrl: card.imageUrl,
            title: card.title,
            supertitle: latestChapterLabel(card.latestChapterTitle, language),
            summary: shortSummary(card.intro),
            infoItems: infoItems(
              { symbol: INFO_SYMBOLS.date, text: relativeDateIt(card.updatedAt) },
              { symbol: INFO_SYMBOLS.type, text: card.genres.slice(0, 2).join(" · ") },
            ),
            contentRating: ContentRating.EVERYONE,
          },
        ];
      }
      return [
        {
          type: "simpleCarouselItem",
          mangaId,
          imageUrl: card.imageUrl,
          title: card.title,
          subtitle: latestChapterLabel(card.latestChapterTitle, language),
          contentRating: ContentRating.EVERYONE,
        },
      ];
    });

    return { items };
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    rawMetadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const metadata = rawMetadata as NiaddMetadata | undefined;
    const page = metadata?.page ?? 1;
    const title = query.title.trim();
    // Without a title, show the (single-page) popular list.
    if (!title && page > 1) return { items: [] };
    const language = selectedLanguage();
    const { baseUrl } = NIADD_LANGUAGES[language];
    const url = title
      ? `${baseUrl}/search/?name=${encodeURIComponent(title).replace(/%20/gu, "+")}&page=${page}`
      : listUrl(baseUrl, "Hot-Manga");
    const cards = parseMangaList(await this.fetchHtml(url), baseUrl);

    return {
      items: cards.map((card) => ({
        mangaId: encodeMangaId(language, card.mangaId),
        title: card.title,
        imageUrl: card.imageUrl,
        subtitle: latestChapterLabel(card.latestChapterTitle, language),
        contentRating: ContentRating.EVERYONE,
      })),
      metadata: title ? nextMetadata(cards, page, metadata) : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const { language, slug } = decodeMangaId(mangaId);
    const site = NIADD_LANGUAGES[language];
    const details = parseMangaDetails(
      await this.fetchHtml(mangaUrl(site.baseUrl, slug)),
      site.baseUrl,
      language,
    );
    if (!details.title) throw new Error("Niadd: scheda del manga non riconosciuta.");

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: details.title,
        secondaryTitles: details.secondaryTitles,
        thumbnailUrl: details.imageUrl,
        synopsis: details.synopsis,
        author: details.author,
        artist: details.artist,
        status: details.status,
        contentRating: details.mature ? ContentRating.MATURE : ContentRating.EVERYONE,
        tagGroups:
          details.genres.length > 0
            ? [{ id: "genres", title: "Generi", tags: details.genres }]
            : [],
        shareUrl: mangaUrl(site.baseUrl, slug),
        additionalInfo: detailInfo({
          Fonte: "Niadd",
          Lingua: site.label,
          Anno: details.released,
        }),
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const { language, slug } = decodeMangaId(sourceManga.mangaId);
    const site = NIADD_LANGUAGES[language];
    const chapters = parseChapters(
      await this.fetchHtml(`${site.baseUrl}/manga/${slug}/chapters.html`),
      sourceManga.mangaInfo.primaryTitle,
    );

    // Keep the site's order even when titles carry no usable number (extras, oneshots).
    return chapters.map((chapter, index) => ({
      chapterId: chapter.chapterId,
      sourceManga,
      title: chapter.title,
      chapNum: chapter.chapNum,
      volume: chapter.volume,
      publishDate: chapter.publishDate,
      langCode: site.langCode,
      sortingIndex: chapters.length - index,
    }));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaId = chapter.sourceManga.mangaId;
    const { language, slug } = decodeMangaId(mangaId);
    const { baseUrl } = NIADD_LANGUAGES[language];
    const firstUrl = readerUrl(baseUrl, slug, chapter.chapterId, 1);
    const first = parseReaderPage(await this.fetchHtml(firstUrl), baseUrl);
    const pages = [...first.images];

    // Sequential on purpose: image URLs are signed and short-lived, and the site rate-limits bursts.
    // The page selector may name the chapter with another slug, so compare by page number.
    for (const url of first.pageUrls
      .filter((pageUrl) => !pageUrl.endsWith("-10-1.html"))
      .slice(0, MAX_READER_PAGES)) {
      pages.push(...parseReaderPage(await this.fetchHtml(url), baseUrl).images);
    }

    const images = dedupeImages(pages);
    if (images.length === 0) throw new Error("Niadd: nessuna pagina trovata per questo capitolo.");
    return { id: chapter.chapterId, mangaId, pages: images };
  }

  getMangaShareUrl(mangaId: string): string {
    const { language, slug } = decodeMangaId(mangaId);
    return mangaUrl(NIADD_LANGUAGES[language].baseUrl, slug);
  }

  async cloudflareBypassCompleted(
    _request: Request,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ): Promise<void> {
    const fallbackExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000);
    for (const cookie of cookies) {
      if (cookie.expires && cookie.expires.getTime() <= Date.now()) continue;
      this.cookieStorageInterceptor.setCookie(
        cookie.expires ? cookie : { ...cookie, expires: fallbackExpiry },
      );
    }
    this.requestManager.markBypassCompleted();
  }

  private async fetchHtml(url: string): Promise<string> {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    if (response.status === 404) throw new Error("Niadd: contenuto non trovato.");
    if (response.status >= 400) throw new Error(`Niadd HTTP ${response.status}`);
    return Application.arrayBufferToUTF8String(data);
  }
}

/** Avoids the global URL class, which the Paperback runtime may not provide. */
function originOf(url: string): string {
  return url.match(/^https?:\/\/[^/]+/u)?.[0] ?? url;
}

function mangaUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/manga/${slug}.html`;
}

/** Niadd lists are a single page of 60 titles: `/list/<name>-N/` does not paginate. */
function listUrl(baseUrl: string, list: string): string {
  return `${baseUrl}/list/${list}/`;
}

/** Search pages past the end are empty; also stop if a page repeats the previous one. */
function nextMetadata(
  cards: NiaddCard[],
  page: number,
  metadata: NiaddMetadata | undefined,
): NiaddMetadata | undefined {
  const firstId = cards[0]?.mangaId;
  if (!firstId || firstId === metadata?.firstId) return undefined;
  return { page: page + 1, firstId };
}

export const Niadd = new NiaddExtension();
