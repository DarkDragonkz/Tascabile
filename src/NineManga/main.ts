import {
  ContentRating,
  DiscoverSectionType,
  Form,
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

import { getNineMangaReaderParser } from "./parsers";

const LANGUAGE_STATE_KEY = "ninemanga_language";
const DEFAULT_LANGUAGE = "ita";
const MAX_CHAPTER_PAGE_REQUESTS = 120;
const ADVANCED_SEARCH_PARAMS =
  "name_sel=contain&wd=&author_sel=contain&author=&artist=contain&artist=&category_id=&out_category_id=&completed_series=either";

const NINEMANGA_SITES = {
  eng: { title: "English", baseUrl: "https://www.ninemanga.com", languageCode: "en" },
  esp: { title: "Español", baseUrl: "https://es.ninemanga.com", languageCode: "es" },
  rus: { title: "Русский", baseUrl: "https://ru.ninemanga.com", languageCode: "ru" },
  deu: { title: "Deutsch", baseUrl: "https://de.ninemanga.com", languageCode: "de" },
  ita: { title: "Italiano", baseUrl: "https://it.ninemanga.com", languageCode: "it" },
  fra: { title: "Français", baseUrl: "https://fr.ninemanga.com", languageCode: "fr" },
  br: { title: "Português BR", baseUrl: "https://br.ninemanga.com", languageCode: "pt-BR" },
} as const;

const NINEMANGA_LABELS = {
  eng: {
    updated: "Latest Updates",
    popular: "Popular Series",
    newest: "New Series",
    languageSettingTitle: "NineManga Language",
    selectedLanguage: "Selected",
    settingsFooter: "Choose the NineManga domain used for home, search, details, and reading.",
  },
  esp: {
    updated: "Últimas actualizaciones",
    popular: "Series populares",
    newest: "Nuevas series",
    languageSettingTitle: "Idioma de NineManga",
    selectedLanguage: "Seleccionado",
    settingsFooter: "Elige el dominio de NineManga usado para inicio, búsqueda, detalles y lectura.",
  },
  rus: {
    updated: "Последние обновления",
    popular: "Популярные серии",
    newest: "Новые серии",
    languageSettingTitle: "Язык NineManga",
    selectedLanguage: "Выбрано",
    settingsFooter: "Выберите домен NineManga для главной страницы, поиска, описаний и чтения.",
  },
  deu: {
    updated: "Neueste Updates",
    popular: "Beliebte Serien",
    newest: "Neue Serien",
    languageSettingTitle: "NineManga-Sprache",
    selectedLanguage: "Ausgewählt",
    settingsFooter: "Wähle die NineManga-Domain für Startseite, Suche, Details und Reader.",
  },
  ita: {
    updated: "Ultimi aggiornamenti",
    popular: "Più popolari",
    newest: "Nuove serie",
    languageSettingTitle: "Lingua NineManga",
    selectedLanguage: "Selezionata",
    settingsFooter: "Seleziona il dominio NineManga usato da home, ricerca, dettagli e lettura.",
  },
  fra: {
    updated: "Dernières mises à jour",
    popular: "Séries populaires",
    newest: "Nouvelles séries",
    languageSettingTitle: "Langue NineManga",
    selectedLanguage: "Sélectionnée",
    settingsFooter: "Choisis le domaine NineManga utilisé pour l’accueil, la recherche, les détails et la lecture.",
  },
  br: {
    updated: "Últimas atualizações",
    popular: "Séries populares",
    newest: "Novas séries",
    languageSettingTitle: "Idioma do NineManga",
    selectedLanguage: "Selecionado",
    settingsFooter: "Escolha o domínio NineManga usado na página inicial, busca, detalhes e leitura.",
  },
} as const;

type NineMangaLanguage = keyof typeof NINEMANGA_SITES;

type NineMangaMetadata = {
  page?: number;
};

type ParsedCard = {
  mangaId: string;
  title: string;
  imageUrl: string;
  subtitle?: string;
};

type ChapterLink = ReturnType<CheerioAPI>;

type FetchedHtml = {
  url: string;
  html: string;
};

class NineMangaSettingsForm extends Form {
  override getSections() {
    const selectedSite = getSelectedSite();
    const labels = getSelectedLabels();

    return [
      Section(
        {
          id: "ninemanga_language_settings",
          footer: labels.settingsFooter,
        },
        [
          SelectRow("ninemanga_language", {
            title: labels.languageSettingTitle,
            subtitle: `${labels.selectedLanguage}: ${selectedSite.title}`,
            value: [getSelectedLanguage()],
            options: Object.entries(NINEMANGA_SITES).map(([id, site]) => ({ id, title: site.title })),
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as NineMangaSettingsForm, "handleLanguageChange"),
          }),
        ],
      ),
    ];
  }

  async handleLanguageChange(value: string[]): Promise<void> {
    Application.setState(value[0] ?? DEFAULT_LANGUAGE, LANGUAGE_STATE_KEY);
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
    SettingsFormProviding
{
  readonly requestManager = new NineMangaInterceptor("ninemanga-main");

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new NineMangaSettingsForm();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const labels = getSelectedLabels();
    return [
      { id: "updated_section", title: labels.updated, type: DiscoverSectionType.simpleCarousel },
      { id: "popular_section", title: labels.popular, type: DiscoverSectionType.featured },
      { id: "new_section", title: labels.newest, type: DiscoverSectionType.simpleCarousel },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: NineMangaMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const baseUrl = getSelectedSite().baseUrl;
    const page = metadata?.page ?? 1;
    const url = this.getDiscoverUrl(section.id, page, baseUrl);
    const html = await this.fetchHtml({ url, method: "GET" } as Request);
    const $ = cheerio.load(html);
    const cards = this.parseCards($, section.id, html);

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

    return {
      items,
      metadata: this.hasNextPage($) ? { page: page + 1 } : undefined,
    };
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata: NineMangaMetadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const title = query.title.trim();
    const baseUrl = getSelectedSite().baseUrl;
    const url = title
      ? `${baseUrl}/search/?wd=${encodeURIComponent(title).replace(/%20/gu, "+")}${page > 1 ? `&page=${page}.html` : ""}`
      : this.getAdvancedSearchUrl(baseUrl, page);

    const html = await this.fetchHtml({ url, method: "GET" } as Request);
    const $ = cheerio.load(html);
    const items = this.parseCards($, "search_section", html).map((card) => ({
      mangaId: card.mangaId,
      title: card.title,
      subtitle: card.subtitle,
      imageUrl: card.imageUrl,
      metadata: undefined,
    }));

    return { items, metadata: items.length > 0 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const baseUrl = getSelectedSite().baseUrl;
    const url = `${baseUrl}/${mangaId}${mangaId.includes("?") ? "&" : "?"}waring=1`;
    const $ = await this.fetchCheerio({ url, method: "GET" } as Request);

    const title =
      cleanText($(".ttline h1[itemprop='name']").first().text()) ||
      cleanText($(".book-title h1, h1.book-title, h1").first().text()) ||
      cleanText($("meta[property='og:title']").attr("content"));

    const image = normalizeUrl(
      getImageUrl($(".bookintro .bookface img").first()) || $("meta[property='og:image']").attr("content") || "",
      baseUrl,
    );

    const synopsis = cleanText(
      $(".bookintro p[itemprop='description']").first().text().replace(/^Sommario:\s*/iu, "") ||
        $(".detail-info p, .summary, .book-summary").first().text(),
    );

    const author = cleanText($(".bookintro [itemprop='author']").first().text());
    const status = this.parseStatus($);

    const genres = $(".bookintro li[itemprop='genre'] a")
      .toArray()
      .map((element) => cleanText($(element).text()))
      .filter((genre) => genre.length > 0);

    const tagGroups: TagSection[] =
      genres.length > 0
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
        secondaryTitles: this.parseSecondaryTitles($),
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
      const chapterLink = unit.find("a.chapter_list_a[href*='/chapter/']").first();
      this.addChapterFromLink(chapters, seen, sourceManga, chapterLink, cleanText(unit.find("span").last().text()));
    });

    if (chapters.length === 0) {
      $("a[href*='/chapter/'], a[href*='/c/']").each((_, element) => {
        const link = $(element);
        if (link.closest("select").length > 0) return;
        this.addChapterFromLink(chapters, seen, sourceManga, link, "");
      });
    }

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const language = getSelectedLanguage();
    const readerParser = getNineMangaReaderParser(language);
    const baseUrl = getSelectedSite().baseUrl;
    const cleanChapterId = normalizeChapterId(chapter.chapterId).replace(/\.html$/u, "").replace(/\/+$/u, "");
    const candidateUrls = this.getChapterReaderUrls(baseUrl, cleanChapterId);
    const firstPage = await this.fetchFirstAvailableHtml(candidateUrls);
    const selector$ = cheerio.load(firstPage.html);
    const chapterPageUrls = this.parseChapterPageUrls(selector$, baseUrl);
    const sourceUrls = language === "eng" ? this.parseEnglishSourceUrls(selector$, baseUrl) : [];
    const urls = sourceUrls.length > 0 ? sourceUrls : chapterPageUrls.length > 0 ? chapterPageUrls : candidateUrls;
    const pages: string[] = [];

    /*
     * English NineManga direct reader pages use chunks like:
     * /chapter/ONE%20PIECE/2547-10-1.html
     * /chapter/ONE%20PIECE/2547-10-2.html
     *
     * The next chunk is exposed as a JS variable:
     * next_page = "/chapter/ONE%20PIECE/2547-10-2.html";
     *
     * Keep this branch English-only so the Italian flow remains unchanged.
     */
    if (language === "eng" && sourceUrls.length === 0) {
      const seenUrls = new Set<string>();
      let currentPage: FetchedHtml | undefined = firstPage;

      while (currentPage && !seenUrls.has(currentPage.url) && seenUrls.size < MAX_CHAPTER_PAGE_REQUESTS) {
        seenUrls.add(currentPage.url);

        const $ = cheerio.load(currentPage.html);
        pages.push(...readerParser(currentPage.html, $, baseUrl));

        const nextUrl = this.parseNextPageUrl(currentPage.html, baseUrl, cleanChapterId);
        if (!nextUrl || seenUrls.has(nextUrl)) break;

        try {
          currentPage = {
            url: nextUrl,
            html: await this.fetchHtml({ url: nextUrl, method: "GET" } as Request),
          };
        } catch {
          break;
        }
      }

      return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: dedupeStrings(pages) };
    }

    if (sourceUrls.length === 0) {
      pages.push(...readerParser(firstPage.html, selector$, baseUrl));
    }

    if (language !== "eng" || pages.length === 0 || sourceUrls.length > 0) {
      for (const url of urls.slice(0, MAX_CHAPTER_PAGE_REQUESTS)) {
        if (url === firstPage.url) continue;

        try {
          const html = await this.fetchHtml({ url, method: "GET" } as Request);
          const $ = cheerio.load(html);
          pages.push(...readerParser(html, $, baseUrl));

          if (language === "eng" && pages.length > 0) break;
        } catch {
          continue;
        }
      }
    }

    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: dedupeStrings(pages) };
  }

  getMangaShareUrl(mangaId: string): string {
    return `${getSelectedSite().baseUrl}/${mangaId}`;
  }

  private getChapterReaderUrls(baseUrl: string, cleanChapterId: string): string[] {
    return dedupeStrings([
      `${baseUrl}/${cleanChapterId}-10-1.html`,
      `${baseUrl}/${cleanChapterId}.html`,
      `${baseUrl}/${cleanChapterId}/`,
      `${baseUrl}/${cleanChapterId}`,
    ]);
  }

  private getAdvancedSearchUrl(baseUrl: string, page: number): string {
    return page > 1
      ? `${baseUrl}/search/?${ADVANCED_SEARCH_PARAMS}&page=${page}.html`
      : `${baseUrl}/search/?${ADVANCED_SEARCH_PARAMS}&type=`;
  }

  private getDiscoverUrl(sectionId: string, page: number, baseUrl: string): string {
    const pageSuffix = page > 1 ? `${page}.html` : "";
    switch (sectionId) {
      case "popular_section":
        return `${baseUrl}/list/Hot-Book/${pageSuffix}`;
      case "new_section":
        return `${baseUrl}/list/New-Book/${pageSuffix}`;
      default:
        return `${baseUrl}/list/New-Update/${pageSuffix}`;
    }
  }

  private async fetchHtml(request: Request): Promise<string> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) throw new Error("Content not found");
    return Application.arrayBufferToUTF8String(data);
  }

  private async fetchFirstAvailableHtml(urls: string[]): Promise<FetchedHtml> {
    for (const url of urls) {
      try {
        return { url, html: await this.fetchHtml({ url, method: "GET" } as Request) };
      } catch {
        continue;
      }
    }

    throw new Error("Content not found");
  }

  private async fetchCheerio(request: Request): Promise<CheerioAPI> {
    return cheerio.load(await this.fetchHtml(request));
  }

  private parseCards($: CheerioAPI, sectionId: string, html: string): ParsedCard[] {
    const mobileSelector = this.getMobileSectionSelector(sectionId);
    const mobileCards = this.parseCardsFromSelector($, mobileSelector);
    if (mobileCards.length > 0) return mobileCards;

    const listCards = this.parseCardsFromSelector($, "ul.direlist > li, dl.bookinfo");
    if (listCards.length > 0) return listCards;

    return this.parseCardsFromHtml(html);
  }

  private getMobileSectionSelector(sectionId: string): string {
    switch (sectionId) {
      case "new_section":
        return "#tab_content_1 > li";
      case "popular_section":
        return "#tab_content_3 > li";
      case "updated_section":
        return "#tab_content_2 > li";
      default:
        return "ul.direlist > li, dl.bookinfo";
    }
  }

  private parseCardsFromSelector($: CheerioAPI, selector: string): ParsedCard[] {
    const cards: ParsedCard[] = [];

    $(selector).each((_, element) => {
      const unit = $(element);
      const titleLink = unit
        .find("a.bookname, dd.book-list a[href*='/manga/'], dd a[href*='/manga/']")
        .first();
      const coverLink = unit.find("dt a[href*='/manga/'], a.bookface[href*='/manga/']").first();
      const image = unit.find("dt img, img").first();
      const chapterLink = unit
        .find("a.chaptername, dd.chapter a[href*='/chapter/'], dd.book-list a[href*='/chapter/'], a[href*='/chapter/'], a[href*='/c/']")
        .first();

      const mangaId = normalizeMangaId(titleLink.attr("href") || coverLink.attr("href") || "");
      const title =
        cleanText(titleLink.text()) ||
        cleanText(titleLink.find("b").text()) ||
        cleanText(titleLink.attr("title")) ||
        cleanText(coverLink.attr("title")) ||
        cleanText(image.attr("alt"));

      const subtitle = cleanText(chapterLink.text()) || cleanText(chapterLink.attr("title"));
      const imageUrl = normalizeUrl(getImageUrl(image), getSelectedSite().baseUrl);

      if (!title || !mangaId) return;
      cards.push({ mangaId, title, imageUrl, subtitle });
    });

    return dedupeCards(cards).slice(0, 48);
  }

  private parseCardsFromHtml(html: string): ParsedCard[] {
    const cards: ParsedCard[] = [];
    const seen = new Set<string>();
    const mangaLinkPattern = /<a\b([^>]*href=["'][^"']*\/manga\/[^"']+\.html[^"']*["'][^>]*)>([\s\S]*?)<\/a>/giu;
    let match: RegExpExecArray | null;

    while ((match = mangaLinkPattern
