import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  Form,
  PaperbackInterceptor,
  Section,
  ToggleRow,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
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
  formatDateIt,
  infoItems,
  relativeDateIt,
  shortSummary,
} from "../common/discover";
import { RequestCache } from "../common/requestCache";
import {
  API_URL,
  BASE_URL,
  matchesQuery,
  parseChapterPages,
  parseComicDetails,
  parseComicList,
  parseLatestChapters,
  type JuinComic,
} from "./parsers";

const HIDE_ADULT_KEY = "juinjutsu.hideAdult";
// The catalogue is ~120 series over a handful of API pages; stop well past that.
const MAX_CATALOG_PAGES = 20;

function hideAdult(): boolean {
  return Application.getState(HIDE_ADULT_KEY) === true;
}

function rating(comic: JuinComic): ContentRating {
  return comic.adult ? ContentRating.ADULT : ContentRating.EVERYONE;
}

class JuinJutsuSettingsForm extends Form {
  override getSections() {
    return [
      Section({ id: "juinjutsu_content", footer: "Il filtro viene applicato a Home e ricerca." }, [
        ToggleRow("hide_adult", {
          title: "Nascondi contenuti per adulti",
          value: hideAdult(),
          onValueChange: Application.Selector(this as JuinJutsuSettingsForm, "updateHideAdult"),
        }),
      ]),
    ];
  }

  async updateHideAdult(value: boolean): Promise<void> {
    Application.setState(value, HIDE_ADULT_KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
}

class JuinJutsuInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    // Pages under /content/ answer 403 to a foreign Referer (hotlink protection).
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
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

class JuinJutsuExtension
  implements
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding,
    SettingsFormProviding
{
  readonly requestManager = new JuinJutsuInterceptor("juinjutsu-main");
  readonly rateLimiter = new BasicRateLimiter("juinjutsu-rate", {
    numberOfRequests: 4,
    bufferInterval: 1,
    ignoreImages: true,
  });
  private readonly cache = new RequestCache<string>();

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new JuinJutsuSettingsForm();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "juinjutsu_latest",
        title: "Ultimi capitoli",
        subtitle: "Le uscite più recenti del Juin Jutsu Team",
        type: DiscoverSectionType.chapterUpdates,
      },
      {
        id: "juinjutsu_ongoing",
        title: "In corso",
        subtitle: "Serie con capitoli pubblicati di recente",
        type: DiscoverSectionType.featured,
      },
      {
        id: "juinjutsu_catalog",
        title: "Catalogo",
        subtitle: "Tutte le serie in ordine alfabetico",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (section.id === "juinjutsu_catalog") {
      return {
        items: (await this.loadCatalog()).map((comic) => ({
          type: "simpleCarouselItem",
          mangaId: comic.mangaId,
          imageUrl: comic.thumbnailUrl,
          title: comic.title,
          subtitle: comic.author || undefined,
          contentRating: rating(comic),
        })),
      };
    }

    const updates = parseLatestChapters(
      await this.fetchText(`${API_URL}/chapters/orderby/desc_created/per_page/30`, 300),
    ).filter((update) => !(hideAdult() && update.comic.adult));

    if (section.id === "juinjutsu_latest") {
      return {
        items: updates.map(({ comic, chapter }) => ({
          type: "chapterUpdatesCarouselItem",
          mangaId: comic.mangaId,
          chapterId: chapter.chapterId,
          imageUrl: comic.thumbnailUrl,
          title: comic.title,
          subtitle: chapter.label,
          publishDate: chapter.publishDate,
          contentRating: rating(comic),
        })),
      };
    }

    // One banner per series, in order of its latest chapter.
    const seen = new Set<string>();
    const items: DiscoverSectionItem[] = [];
    for (const { comic, chapter } of updates) {
      if (seen.has(comic.mangaId)) continue;
      seen.add(comic.mangaId);
      items.push({
        type: "featuredCarouselItem",
        mangaId: comic.mangaId,
        imageUrl: comic.coverUrl,
        title: comic.title,
        supertitle: chapter.label,
        summary: shortSummary(comic.synopsis),
        infoItems: infoItems(
          { symbol: INFO_SYMBOLS.date, text: relativeDateIt(chapter.publishDate) },
          { symbol: INFO_SYMBOLS.author, text: comic.author },
        ),
        contentRating: rating(comic),
      });
    }
    return { items };
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    // The API has no search endpoint: the whole catalogue is small, so filter it locally.
    const comics = (await this.loadCatalog()).filter((comic) => matchesQuery(comic, query.title));
    return {
      items: comics.map((comic) => ({
        mangaId: comic.mangaId,
        title: comic.title,
        imageUrl: comic.thumbnailUrl,
        subtitle: comic.author || undefined,
        contentRating: rating(comic),
      })),
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const { comic, chapters } = parseComicDetails(await this.fetchComic(mangaId));
    const latest = chapters[0];
    return {
      mangaId,
      mangaInfo: {
        primaryTitle: comic.title,
        secondaryTitles: [],
        thumbnailUrl: comic.coverUrl,
        synopsis: comic.synopsis,
        author: comic.author || undefined,
        artist: comic.artist || undefined,
        contentRating: rating(comic),
        shareUrl: this.getMangaShareUrl(mangaId),
        additionalInfo: detailInfo({
          Fonte: "Juin Jutsu Team",
          Capitoli: chapters.length > 0 ? String(chapters.length) : undefined,
          "Ultimo capitolo": latest ? formatDateIt(latest.publishDate) : undefined,
          "Su Juin Jutsu dal": formatDateIt(comic.createdAt),
        }),
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const { chapters } = parseComicDetails(await this.fetchComic(sourceManga.mangaId));
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
    const pages = parseChapterPages(
      await this.fetchText(`${API_URL}/chapter/id/${chapter.chapterId}`, 0),
    );
    if (pages.length === 0) throw new Error("Juin Jutsu: nessuna pagina in questo capitolo.");
    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
  }

  getMangaShareUrl(mangaId: string): string {
    return `${BASE_URL}/series/${mangaId}/`;
  }

  private async loadCatalog(): Promise<JuinComic[]> {
    const comics: JuinComic[] = [];
    for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
      const batch = parseComicList(
        await this.fetchText(`${API_URL}/comics/page/${page}`, 1_800, true),
      );
      if (batch.length === 0) break;
      comics.push(...batch);
    }
    return comics
      .filter((comic) => !(hideAdult() && comic.adult))
      .sort((a, b) => a.title.localeCompare(b.title, "it"));
  }

  private fetchComic(mangaId: string): Promise<string> {
    return this.fetchText(`${API_URL}/comic/stub/${encodeURIComponent(mangaId)}`, 120);
  }

  /** `allowNotFound` turns the API's 404 past the last catalogue page into an empty list. */
  private fetchText(url: string, cacheSeconds: number, allowNotFound = false): Promise<string> {
    return this.cache.get(url, cacheSeconds, async () => {
      const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
      if (response.status === 404 && allowNotFound) return '{"comics":[]}';
      if (response.status === 404) throw new Error("Juin Jutsu: contenuto non trovato.");
      if (response.status >= 400) throw new Error(`Juin Jutsu HTTP ${response.status}`);
      return Application.arrayBufferToUTF8String(data);
    });
  }
}

export const JuinJutsu = new JuinJutsuExtension();
