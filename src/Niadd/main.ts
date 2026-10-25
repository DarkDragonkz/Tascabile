import {
  BasicRateLimiter,
  CloudflareError,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  PaperbackInterceptor,
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
  type SourceManga,
} from "@paperback/types";

import {
  NIADD_BASE_URL,
  isChallengePage,
  dedupeImages,
  parseChapters,
  parseMangaDetails,
  parseMangaList,
  parseReaderPage,
  readerUrl,
  type NiaddCard,
} from "./parsers";

// Guards against a malformed page selector looping over unrelated pages.
const MAX_READER_PAGES = 60;

type NiaddMetadata = {
  page?: number;
  firstId?: string;
};

const LISTS: Record<string, string> = {
  niadd_updated: "New-Update",
  niadd_popular: "Hot-Manga",
  niadd_new: "New-Manga",
};

class NiaddInterceptor extends PaperbackInterceptor {
  private lastBypassPromptAt = 0;

  markBypassCompleted(): void {
    this.lastBypassPromptAt = 0;
  }

  override async interceptRequest(request: Request): Promise<Request> {
    request.url = request.url.replace(/^http:\/\//u, "https://");
    request.headers = {
      ...request.headers,
      referer: `${NIADD_BASE_URL}/`,
      "user-agent": await Application.getDefaultUserAgent(),
      "accept-language": "it-IT,it;q=0.9,en;q=0.7",
    };
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (!request.url.startsWith(NIADD_BASE_URL)) return data;
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
      url: NIADD_BASE_URL,
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

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "niadd_updated",
        title: "Ultimi aggiornamenti",
        subtitle: "Capitoli appena pubblicati",
        type: DiscoverSectionType.chapterUpdates,
      },
      {
        id: "niadd_popular",
        title: "Più popolari",
        subtitle: "Le serie più lette su Niadd",
        type: DiscoverSectionType.featured,
      },
      {
        id: "niadd_new",
        title: "Nuove serie",
        subtitle: "Ultime serie aggiunte al catalogo",
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
    const cards = parseMangaList(await this.fetchHtml(listUrl(list)));

    const items = cards.flatMap((card): DiscoverSectionItem[] => {
      if (section.id === "niadd_updated") {
        if (!card.latestChapterId) return [];
        return [
          {
            type: "chapterUpdatesCarouselItem",
            mangaId: card.mangaId,
            chapterId: card.latestChapterId,
            imageUrl: card.imageUrl,
            title: card.title,
            subtitle: card.latestChapterTitle,
            publishDate: card.updatedAt,
            contentRating: ContentRating.EVERYONE,
          },
        ];
      }
      if (section.id === "niadd_popular") {
        return [
          {
            type: "featuredCarouselItem",
            mangaId: card.mangaId,
            imageUrl: card.imageUrl,
            title: card.title,
            supertitle: card.latestChapterTitle,
            contentRating: ContentRating.EVERYONE,
          },
        ];
      }
      return [
        {
          type: "simpleCarouselItem",
          mangaId: card.mangaId,
          imageUrl: card.imageUrl,
          title: card.title,
          subtitle: card.latestChapterTitle,
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
    const url = title
      ? `${NIADD_BASE_URL}/search/?name=${encodeURIComponent(title).replace(/%20/gu, "+")}&page=${page}`
      : listUrl("Hot-Manga");
    const cards = parseMangaList(await this.fetchHtml(url));

    return {
      items: cards.map((card) => ({
        mangaId: card.mangaId,
        title: card.title,
        imageUrl: card.imageUrl,
        subtitle: card.latestChapterTitle,
        contentRating: ContentRating.EVERYONE,
      })),
      metadata: title ? nextMetadata(cards, page, metadata) : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const details = parseMangaDetails(await this.fetchHtml(mangaUrl(mangaId)));
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
        shareUrl: mangaUrl(mangaId),
        additionalInfo: { Fonte: "Niadd", Lingua: "Italiano 🇮🇹" },
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const mangaTitle = sourceManga.mangaInfo.primaryTitle;
    const chapters = parseChapters(
      await this.fetchHtml(`${NIADD_BASE_URL}/manga/${sourceManga.mangaId}/chapters.html`),
      mangaTitle,
    );

    // Keep the site's order even when titles carry no usable number (extras, oneshots).
    return chapters.map((chapter, index) => ({
      chapterId: chapter.chapterId,
      sourceManga,
      title: chapter.title,
      chapNum: chapter.chapNum,
      publishDate: chapter.publishDate,
      langCode: "it",
      sortingIndex: chapters.length - index,
    }));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaId = chapter.sourceManga.mangaId;
    const firstUrl = readerUrl(mangaId, chapter.chapterId, 1);
    const first = parseReaderPage(await this.fetchHtml(firstUrl));
    const pages = [...first.images];

    // Sequential on purpose: image URLs are signed and short-lived, and the site rate-limits bursts.
    for (const url of first.pageUrls
      .filter((pageUrl) => pageUrl !== firstUrl)
      .slice(0, MAX_READER_PAGES)) {
      pages.push(...parseReaderPage(await this.fetchHtml(url)).images);
    }

    const images = dedupeImages(pages);
    if (images.length === 0) throw new Error("Niadd: nessuna pagina trovata per questo capitolo.");
    return { id: chapter.chapterId, mangaId, pages: images };
  }

  getMangaShareUrl(mangaId: string): string {
    return mangaUrl(mangaId);
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

function mangaUrl(mangaId: string): string {
  return `${NIADD_BASE_URL}/manga/${mangaId}.html`;
}

/** Niadd lists are a single page of 60 titles: `/list/<name>-N/` does not paginate. */
function listUrl(list: string): string {
  return `${NIADD_BASE_URL}/list/${list}/`;
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
