import {
  AdvancedSearchForm,
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  PaperbackInterceptor,
  Section,
  SelectRow,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type JSONObject,
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

import { INFO_SYMBOLS, detailInfo, infoItems, relativeDateIt } from "../common/discover";
import { RequestCache } from "../common/requestCache";
import {
  STATUS_OPTIONS,
  hasNextPage,
  parseChapterImages,
  parseChapters,
  parseGenreOptions,
  parseMangaDetails,
  parseMangaList,
  type MadaraCard,
  type MadaraOption,
} from "./parsers";

export interface MadaraConfig {
  /** Prefix for section and interceptor IDs, e.g. "shinobi". */
  key: string;
  /** Team name shown in subtitles and details. */
  name: string;
  /** Site root without trailing slash. */
  baseUrl: string;
}

type PageMetadata = { page?: number };

interface MadaraSearchMeta extends JSONObject {
  genres: string[];
  status: string[];
}

const LISTS = {
  latest: "latest",
  popular: "views",
  new: "new-manga",
} as const;

class MadaraSearchForm extends AdvancedSearchForm {
  private genres: string[];
  private status: string[];

  constructor(
    private readonly config: MadaraConfig,
    private readonly genreOptions: MadaraOption[],
    meta: MadaraSearchMeta | undefined,
  ) {
    super();
    this.genres = meta?.genres ?? [];
    this.status = meta?.status ?? [];
  }

  async updateGenres(value: string[]): Promise<void> {
    this.genres = value;
    this.reloadForm();
  }

  async updateStatus(value: string[]): Promise<void> {
    this.status = value;
    this.reloadForm();
  }

  getSearchQueryMetadata(): JSONObject {
    return {
      searchMeta: { genres: this.genres, status: this.status } satisfies MadaraSearchMeta,
    };
  }

  override getSections() {
    const rows = [
      SelectRow("status", {
        title: "Stato",
        value: this.status,
        options: STATUS_OPTIONS,
        minItemCount: 0,
        maxItemCount: STATUS_OPTIONS.length,
        onValueChange: Application.Selector(this as MadaraSearchForm, "updateStatus"),
      }),
    ];
    if (this.genreOptions.length > 0) {
      rows.unshift(
        SelectRow("genres", {
          title: "Generi",
          value: this.genres,
          options: this.genreOptions,
          minItemCount: 0,
          maxItemCount: this.genreOptions.length,
          onValueChange: Application.Selector(this as MadaraSearchForm, "updateGenres"),
        }),
      );
    }
    return [
      Section(
        {
          id: `${this.config.key}_filters`,
          footer: "Con più generi selezionati compaiono solo le serie che li hanno tutti.",
        },
        rows,
      ),
    ];
  }
}

class MadaraInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly baseUrl: string,
  ) {
    super(id);
  }

  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${this.baseUrl}/`,
      "user-agent": await Application.getDefaultUserAgent(),
    };
    return request;
  }

  override async interceptResponse(
    _request: Request,
    _response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    return data;
  }
}

/** Shared engine for the Madara WordPress theme; each site passes its own config. */
export class MadaraExtension
  implements
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding
{
  readonly requestManager: MadaraInterceptor;
  readonly rateLimiter: BasicRateLimiter;
  private readonly cache = new RequestCache<string>();

  constructor(private readonly config: MadaraConfig) {
    this.requestManager = new MadaraInterceptor(`${config.key}-main`, config.baseUrl);
    this.rateLimiter = new BasicRateLimiter(`${config.key}-rate`, {
      numberOfRequests: 3,
      bufferInterval: 1,
      ignoreImages: true,
    });
  }

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const { key, name } = this.config;
    return [
      {
        id: `${key}_latest`,
        title: "Ultimi aggiornamenti",
        subtitle: `I capitoli più recenti di ${name}`,
        type: DiscoverSectionType.chapterUpdates,
      },
      {
        id: `${key}_popular`,
        title: "Più letti",
        subtitle: "Le serie con più visualizzazioni",
        type: DiscoverSectionType.featured,
      },
      {
        id: `${key}_new`,
        title: "Nuove serie",
        subtitle: "Gli ultimi progetti aggiunti",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const list = section.id.slice(this.config.key.length + 1) as keyof typeof LISTS;
    const order = LISTS[list];
    if (!order) return { items: [] };
    const page = (metadata as PageMetadata | undefined)?.page ?? 1;
    // The popular banner is a single page; the other carousels page through the catalogue.
    if (list === "popular" && page > 1) return { items: [] };

    const path = page > 1 ? `/manga/page/${page}/` : "/manga/";
    const html = await this.fetchHtml(
      `${this.config.baseUrl}${path}?m_orderby=${order}`,
      300,
      true,
    );
    const cards = parseMangaList(html);
    const next = list !== "popular" && hasNextPage(html, page) ? { page: page + 1 } : undefined;

    const items = cards.flatMap((card): DiscoverSectionItem[] => {
      if (list === "latest") {
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
      if (list === "popular") {
        return [
          {
            type: "featuredCarouselItem",
            mangaId: card.mangaId,
            imageUrl: card.imageUrl,
            title: card.title,
            supertitle: card.latestChapterTitle,
            infoItems: infoItems(
              { symbol: INFO_SYMBOLS.date, text: relativeDateIt(card.updatedAt) },
              { symbol: INFO_SYMBOLS.type, text: card.type },
            ),
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
    return { items, metadata: next };
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = (query.metadata as { searchMeta?: MadaraSearchMeta } | undefined)?.searchMeta;
    let genres: MadaraOption[] = [];
    try {
      // The genre list comes from the site's own search form, so new genres appear by themselves.
      genres = parseGenreOptions(
        await this.fetchHtml(`${this.config.baseUrl}/?s=&post_type=wp-manga`, 3_600),
      );
    } catch {
      // Without the list the form still offers the status filter.
    }
    return new MadaraSearchForm(this.config, genres, meta);
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as PageMetadata | undefined)?.page ?? 1;
    const meta = (query.metadata as { searchMeta?: MadaraSearchMeta } | undefined)?.searchMeta;
    const params = [`s=${encodeURIComponent(query.title.trim())}`, "post_type=wp-manga"];
    for (const genre of meta?.genres ?? []) params.push(`genre%5B%5D=${encodeURIComponent(genre)}`);
    if ((meta?.genres?.length ?? 0) > 1) params.push("op=1");
    for (const status of meta?.status ?? [])
      params.push(`status%5B%5D=${encodeURIComponent(status)}`);

    const path = page > 1 ? `/page/${page}/` : "/";
    const html = await this.fetchHtml(
      `${this.config.baseUrl}${path}?${params.join("&")}`,
      60,
      true,
    );
    const cards = parseMangaList(html);
    return {
      items: cards.map((card) => this.toSearchResult(card)),
      metadata: cards.length > 0 && hasNextPage(html, page) ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const details = parseMangaDetails(await this.fetchMangaPage(mangaId));
    if (!details.title)
      throw new Error(`${this.config.name}: scheda della serie non riconosciuta.`);
    return {
      mangaId,
      mangaInfo: {
        primaryTitle: details.title,
        secondaryTitles: details.secondaryTitles,
        thumbnailUrl: details.imageUrl,
        synopsis: details.synopsis,
        author: details.authors.join(", ") || undefined,
        artist: details.artists.join(", ") || undefined,
        status: details.status,
        contentRating: details.adult ? ContentRating.ADULT : ContentRating.EVERYONE,
        tagGroups:
          details.genres.length > 0
            ? [{ id: "genres", title: "Generi", tags: details.genres }]
            : [],
        shareUrl: this.getMangaShareUrl(mangaId),
        additionalInfo: detailInfo({
          Fonte: this.config.name,
          Tipologia: details.type,
          Anno: details.released,
        }),
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const mangaUrl = this.mangaUrl(sourceManga.mangaId);
    // Current Madara versions load chapters over AJAX; older pages still embed them.
    let chapters = parseChapters(await this.fetchChapterList(mangaUrl));
    if (chapters.length === 0)
      chapters = parseChapters(await this.fetchMangaPage(sourceManga.mangaId));

    // Keep the site's order even when titles carry no usable number (extras, promos).
    return chapters.map((chapter, index) => ({
      chapterId: chapter.chapterId,
      sourceManga,
      title: chapter.title,
      chapNum: chapter.chapNum,
      volume: chapter.volume,
      publishDate: chapter.publishDate,
      langCode: "it",
      sortingIndex: chapters.length - index,
    }));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = `${this.mangaUrl(chapter.sourceManga.mangaId)}${chapter.chapterId}/?style=list`;
    const pages = parseChapterImages(await this.fetchHtml(url, 0));
    if (pages.length === 0)
      throw new Error(`${this.config.name}: nessuna pagina in questo capitolo.`);
    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
  }

  getMangaShareUrl(mangaId: string): string {
    return this.mangaUrl(mangaId);
  }

  private toSearchResult(card: MadaraCard): SearchResultItem {
    return {
      mangaId: card.mangaId,
      title: card.title,
      imageUrl: card.imageUrl,
      subtitle: card.latestChapterTitle,
      contentRating: ContentRating.EVERYONE,
    };
  }

  private mangaUrl(mangaId: string): string {
    return `${this.config.baseUrl}/manga/${mangaId}/`;
  }

  private fetchMangaPage(mangaId: string): Promise<string> {
    return this.fetchHtml(this.mangaUrl(mangaId), 120);
  }

  private fetchChapterList(mangaUrl: string): Promise<string> {
    const url = `${mangaUrl}ajax/chapters/`;
    return this.cache.get(url, 120, async () => {
      const [response, data] = await Application.scheduleRequest({
        url,
        method: "POST",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      // Not fatal: getChapters falls back to the chapters embedded in the series page.
      return response.status >= 400 ? "" : Application.arrayBufferToUTF8String(data);
    });
  }

  /** `emptyOnNotFound`: the theme answers 404 past the last page of a list or search. */
  private fetchHtml(url: string, cacheSeconds: number, emptyOnNotFound = false): Promise<string> {
    return this.cache.get(url, cacheSeconds, async () => {
      const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
      if (response.status === 404 && emptyOnNotFound) return "";
      if (response.status === 404) throw new Error(`${this.config.name}: contenuto non trovato.`);
      if (response.status >= 400) throw new Error(`${this.config.name} HTTP ${response.status}`);
      return Application.arrayBufferToUTF8String(data);
    });
  }
}
