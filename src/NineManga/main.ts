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
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ADVANCED_SEARCH_PARAMS =
  "name_sel=contain&wd=&author_sel=contain&author=&artist_sel=contain&artist=&category_id=&out_category_id=&completed_series=either";

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
      "user-agent": DESKTOP_USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9,it;q=0.8",
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
      ? `${baseUrl}/search/?wd=${encodeURIComponent(title).replace(/%20/gu, "+")}${
          page > 1 ? `&page=${page}.html` : ""
        }`
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
    const language = getSelectedLanguage();
    const url = `${baseUrl}/${sourceManga.mangaId}${sourceManga.mangaId.includes("?") ? "&" : "?"}waring=1`;
    const $ = await this.fetchCheerio({ url, method: "GET" } as Request);
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    $(".sub_vol_ul li").each((_, element) => {
      const unit = $(element);

      if (language === "eng") {
        const directReaderLink = unit
          .find(
            "em.page_choose a[href*='/chapter/'][href*='-10-1.html'], em.page_choose a[href*='/chapter/'][href*='-10-1']",
          )
          .first();

        if (directReaderLink.length > 0) {
          this.addChapterFromLink(
            chapters,
            seen,
            sourceManga,
            directReaderLink,
            cleanText(unit.find("span").last().text()),
          );
          return;
        }

        const proxyChapterLink = unit
          .find(
            [
              "a.chapter_list_a[href*='/go/ennm/']",
              "a.chapter_list_a[href*='type=enninemanga']",
              "a[href*='/go/ennm/']",
              "a[href*='type=enninemanga']",
            ].join(", "),
          )
          .first();

        if (proxyChapterLink.length > 0) {
          this.addEnglishChapterFromProxyLink(
            chapters,
            seen,
            sourceManga,
            proxyChapterLink,
            cleanText(unit.find("span").last().text()),
          );
          return;
        }
      }

      const chapterLink = unit.find("a.chapter_list_a[href*='/chapter/']").first();
      this.addChapterFromLink(chapters, seen, sourceManga, chapterLink, cleanText(unit.find("span").last().text()));
    });

    if (chapters.length === 0) {
      if (language === "eng") {
        $("a[href*='/go/ennm/'], a[href*='type=enninemanga']").each((_, element) => {
          const link = $(element);
          if (link.closest("select").length > 0) return;
          this.addEnglishChapterFromProxyLink(chapters, seen, sourceManga, link, "");
        });
      }

      if (chapters.length === 0) {
        $("a[href*='/chapter/'], a[href*='/c/']").each((_, element) => {
          const link = $(element);
          if (link.closest("select").length > 0) return;
          this.addChapterFromLink(chapters, seen, sourceManga, link, "");
        });
      }
    }

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const language = getSelectedLanguage();
    const readerParser = getNineMangaReaderParser(language);
    const baseUrl = getSelectedSite().baseUrl;
    const cleanChapterId =
      language === "eng"
        ? normalizeEnglishChapterIdForReader(chapter.chapterId)
        : normalizeChapterId(chapter.chapterId)
            .replace(/\.html$/u, "")
            .replace(/\/+$/u, "");

    const candidateUrls = this.getChapterReaderUrls(baseUrl, cleanChapterId);
    const pages: string[] = [];

    if (language === "eng") {
      const seenUrls = new Set<string>();

      for (const candidateUrl of candidateUrls.slice(0, MAX_CHAPTER_PAGE_REQUESTS)) {
        let currentPage: FetchedHtml | undefined;

        try {
          currentPage = {
            url: candidateUrl,
            html: await this.fetchHtml({ url: candidateUrl, method: "GET" } as Request),
          };
        } catch {
          continue;
        }

        while (currentPage && !seenUrls.has(currentPage.url) && seenUrls.size < MAX_CHAPTER_PAGE_REQUESTS) {
          seenUrls.add(currentPage.url);

          const $ = cheerio.load(currentPage.html);
          pages.push(...readerParser(currentPage.html, $, baseUrl));

          if (pages.length === 0) {
            const rebuiltReaderUrl = this.parseEnglishReaderUrlFromSourceLink(
              $,
              baseUrl,
              chapter.sourceManga.mangaId,
            );

            if (rebuiltReaderUrl && !seenUrls.has(rebuiltReaderUrl)) {
              try {
                currentPage = {
                  url: rebuiltReaderUrl,
                  html: await this.fetchHtml({ url: rebuiltReaderUrl, method: "GET" } as Request),
                };
                continue;
              } catch {
                break;
              }
            }
          }

          if (pages.length > 0) {
            const pageUrls = this.parseChapterPageUrls($, baseUrl);
            const currentIndex = pageUrls.indexOf(currentPage.url);
            const nextFromSelect = currentIndex >= 0 ? pageUrls[currentIndex + 1] ?? "" : "";
            const nextFromScript = this.parseNextPageUrl(currentPage.html, baseUrl, cleanChapterId);
            const nextUrl = nextFromSelect || nextFromScript;

            if (!nextUrl || seenUrls.has(nextUrl)) break;

            try {
              currentPage = {
                url: nextUrl,
                html: await this.fetchHtml({ url: nextUrl, method: "GET" } as Request),
              };
            } catch {
              break;
            }

            continue;
          }

          break;
        }

        if (pages.length > 0) break;
      }

      return {
        id: chapter.chapterId,
        mangaId: chapter.sourceManga.mangaId,
        pages: dedupeStrings(pages),
      };
    }

    const firstPage = await this.fetchFirstAvailableHtml(candidateUrls);
    const selector$ = cheerio.load(firstPage.html);
    const chapterPageUrls = this.parseChapterPageUrls(selector$, baseUrl);
    const urls = chapterPageUrls.length > 0 ? chapterPageUrls : candidateUrls;

    pages.push(...readerParser(firstPage.html, selector$, baseUrl));

    for (const url of urls.slice(0, MAX_CHAPTER_PAGE_REQUESTS)) {
      if (url === firstPage.url) continue;

      try {
        const html = await this.fetchHtml({ url, method: "GET" } as Request);
        const $ = cheerio.load(html);
        pages.push(...readerParser(html, $, baseUrl));
      } catch {
        continue;
      }
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: dedupeStrings(pages),
    };
  }

  getMangaShareUrl(mangaId: string): string {
    return `${getSelectedSite().baseUrl}/${mangaId}`;
  }

  private getChapterReaderUrls(baseUrl: string, cleanChapterId: string): string[] {
    const language = getSelectedLanguage();
    const readerChapterId = /-\d+-\d+$/u.test(cleanChapterId)
      ? cleanChapterId
      : `${cleanChapterId}-10-1`;

    if (language === "eng") {
      return dedupeStrings([`${baseUrl}/${readerChapterId}.html`]);
    }

    if (language === "esp") {
      return dedupeStrings([
        `${baseUrl}/${cleanChapterId}.html`,
        `${baseUrl}/${readerChapterId}.html`,
        `${baseUrl}/${cleanChapterId}/`,
        `${baseUrl}/${cleanChapterId}`,
      ]);
    }

    return dedupeStrings([
      `${baseUrl}/${readerChapterId}.html`,
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
        .find(
          "a.chaptername, dd.chapter a[href*='/chapter/'], dd.book-list a[href*='/chapter/'], a[href*='/chapter/'], a[href*='/c/']",
        )
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

    while ((match = mangaLinkPattern.exec(html)) !== null) {
      const attributes = match[1] ?? "";
      const innerHtml = match[2] ?? "";
      const href = getAttribute(attributes, "href");
      const mangaId = normalizeMangaId(href);
      if (!mangaId || seen.has(mangaId)) continue;

      const nearbyHtml = html.slice(Math.max(0, match.index - 500), Math.min(html.length, match.index + 1200));
      const imageUrl = normalizeUrl(getImageSrc(innerHtml) || getImageSrc(nearbyHtml), getSelectedSite().baseUrl);
      const title = cleanText(getAttribute(attributes, "title")) || cleanText(stripHtml(innerHtml));
      const subtitle = cleanText(getFirstChapterTitle(nearbyHtml));

      if (!title) continue;
      seen.add(mangaId);
      cards.push({ mangaId, title, imageUrl, subtitle });
    }

    return cards.slice(0, 48);
  }

  private addChapterFromLink(
    chapters: Chapter[],
    seen: Set<string>,
    sourceManga: SourceManga,
    link: ChapterLink,
    dateText: string,
  ): void {
    const chapterId = normalizeChapterId(link.attr("href") ?? "").replace(/\.html$/u, "");
    const title = cleanText(link.text()) || cleanText(link.attr("title")) || chapterId.split("/").pop() || "";
    if (!chapterId || !isChapterId(chapterId) || !title || seen.has(chapterId)) return;

    seen.add(chapterId);
    chapters.push({
      chapterId,
      title,
      sourceManga,
      chapNum: extractChapterNumber(title),
      publishDate: parseDate(dateText),
      langCode: getSelectedSite().languageCode,
    });
  }

  private addEnglishChapterFromProxyLink(
    chapters: Chapter[],
    seen: Set<string>,
    sourceManga: SourceManga,
    link: ChapterLink,
    dateText: string,
  ): void {
    const href = link.attr("href") ?? "";
    const chapterNumberId = extractEnglishProxyChapterId(href);
    const mangaSlug = extractMangaSlugFromMangaId(sourceManga.mangaId);

    if (!chapterNumberId || !mangaSlug) return;

    const chapterId = `chapter/${mangaSlug}/${chapterNumberId}-10-1`;
    const title = cleanText(link.text()) || cleanText(link.attr("title")) || chapterNumberId;

    if (!chapterId || !isChapterId(chapterId) || !title || seen.has(chapterId)) return;

    seen.add(chapterId);
    chapters.push({
      chapterId,
      title,
      sourceManga,
      chapNum: extractChapterNumber(title),
      publishDate: parseDate(dateText),
      langCode: getSelectedSite().languageCode,
    });
  }

  private parseChapterPageUrls($: CheerioAPI, baseUrl: string): string[] {
    const urls: string[] = [];

    $("select.sl-page option, select#page option, select[name='page'] option").each((_, element) => {
      const value = $(element).attr("value") ?? "";
      if (!value || !isChapterId(value)) return;

      const url = normalizeUrl(value, baseUrl);
      if (url && !urls.includes(url)) urls.push(url);
    });

    return urls;
  }

  private parseEnglishReaderUrlFromSourceLink($: CheerioAPI, baseUrl: string, mangaId: string): string {
    const href =
      $(
        [
          "a[href*='/go/ennm/']",
          "a[href*='type=enninemanga']",
        ].join(", "),
      )
        .first()
        .attr("href") ?? "";

    const chapterNumberId = extractEnglishProxyChapterId(href);
    const mangaSlug = extractMangaSlugFromMangaId(mangaId);

    if (!chapterNumberId || !mangaSlug) return "";

    return `${baseUrl}/chapter/${mangaSlug}/${chapterNumberId}-10-1.html`;
  }

  private parseNextPageUrl(html: string, baseUrl: string, cleanChapterId: string): string {
    const match = html.match(/\bnext_page\s*=\s*["']([^"']+)["']/u);
    const nextPage = normalizeUrl(match?.[1] ?? "", baseUrl);
    if (!nextPage || !isChapterId(nextPage)) return "";

    const currentBase = cleanChapterId.replace(/-\d+-\d+$/u, "");
    const nextId = normalizeChapterId(nextPage).replace(/\.html$/u, "").replace(/\/+$/u, "");
    const nextBase = nextId.replace(/-\d+-\d+$/u, "");

    return nextBase === currentBase ? nextPage : "";
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

  private parseStatus($: CheerioAPI): string {
    const statusLabels = ["stato", "status", "estado", "statut", "статус", "situação", "situacao"];
    const labelPattern = /^(?:stato|status|estado|statut|статус|situa(?:ç|c)ão)\s*[:：]?\s*/iu;

    const rows = $(".bookintro li, .bookintro .message li, .message li").toArray();
    for (const row of rows) {
      const unit = $(row);
      const fullText = cleanText(unit.text());
      const lowerText = fullText.toLowerCase();
      const boldLabel = cleanText(unit.find("b, strong").first().text())
        .replace(/[:：]/gu, "")
        .toLowerCase();

      const hasStatusLabel = statusLabels.some(
        (label) => boldLabel === label || lowerText.startsWith(`${label}:`) || lowerText.startsWith(`${label}：`),
      );
      if (!hasStatusLabel) continue;

      const categoryStatusLink = unit.find("a[href*='/category/']").first();
      const fallbackStatusLink = unit
        .find("a")
        .filter((_, statusLink) => !($(statusLink).attr("href") ?? "").includes("mangadogs.com"))
        .first();

      const linkStatus = cleanText(
        categoryStatusLink.length > 0 ? categoryStatusLink.text() : fallbackStatusLink.text(),
      );
      const textStatus = cleanText(fullText.replace(labelPattern, ""));
      return normalizeStatus(linkStatus || textStatus);
    }

    return "Unknown";
  }

  private hasNextPage($: CheerioAPI): boolean {
    return $("a:contains('Next'), a:contains('Successivo'), a[href*='page='], .next a, a.next").length > 0;
  }

  private createSimpleItem(mangaId: string, imageUrl: string, title: string, subtitle?: string): DiscoverSectionItem {
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

function getSelectedLabels(): (typeof NINEMANGA_LABELS)[NineMangaLanguage] {
  return NINEMANGA_LABELS[getSelectedLanguage()];
}

function isNineMangaLanguage(value: string | undefined): value is NineMangaLanguage {
  return value !== undefined && value in NINEMANGA_SITES;
}

function getAttribute(attributes: string, name: string): string {
  const pattern = new RegExp(`${name}=["']([^"']+)["']`, "iu");
  return attributes.match(pattern)?.[1] ?? "";
}

function getImageUrl(image: ChapterLink): string {
  return (
    image.attr("data-original") ||
    image.attr("data-src") ||
    image.attr("data-lazy-src") ||
    image.attr("data-url") ||
    image.attr("src") ||
    ""
  );
}

function getImageSrc(html: string): string {
  const imageTag = html.match(/<img\b[^>]*>/iu)?.[0] ?? "";
  return (
    getAttribute(imageTag, "data-original") ||
    getAttribute(imageTag, "data-src") ||
    getAttribute(imageTag, "data-lazy-src") ||
    getAttribute(imageTag, "data-url") ||
    getAttribute(imageTag, "src")
  );
}

function getFirstChapterTitle(html: string): string {
  const chapterMatch = html.match(/<a\b[^>]*href=["'][^"']*\/(?:chapter|c)\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/iu);
  return chapterMatch?.[1] ? stripHtml(chapterMatch[1]) : "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<style\b[\s\S]*?<\/style>/giu, "")
    .replace(/<[^>]+>/gu, " ");
}

function normalizeUrl(value: string, baseUrl: string): string {
  const trimmed = decodeHtmlEntities(value).trim();
  if (!trimmed || isPlaceholderImage(trimmed)) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/")) return `${baseUrl}${trimmed}`;
  return `${baseUrl}/${trimmed}`;
}

function normalizeMangaId(value: string): string {
  const withoutHost = decodeHtmlEntities(value).replace(/^https?:\/\/[^/]+\//iu, "");
  const withoutQuery = withoutHost.split("?")[0] ?? "";
  return withoutQuery.replace(/^\/+|\/+$/gu, "").trim();
}

function normalizeChapterId(value: string): string {
  const withoutHost = decodeHtmlEntities(value).replace(/^https?:\/\/[^/]+\//iu, "");
  const withoutQuery = withoutHost.split("?")[0] ?? "";
  return withoutQuery.replace(/^\/+|\/+$/gu, "").trim();
}

function normalizeEnglishChapterIdForReader(value: string): string {
  const chapterId = normalizeChapterId(value).replace(/\.html$/u, "").replace(/\/+$/u, "");
  if (/-\d+-\d+$/u.test(chapterId)) return chapterId;

  const chapterNumberId = extractEnglishProxyChapterId(chapterId);
  if (!chapterNumberId) return chapterId;

  const mangaSlug = extractMangaSlugFromChapterId(chapterId);
  if (!mangaSlug) return chapterId;

  return `chapter/${mangaSlug}/${chapterNumberId}-10-1`;
}

function extractEnglishProxyChapterId(value: string): string {
  const decoded = decodeHtmlEntities(value);
  const cidMatch = decoded.match(/[?&]cid=(\d+)/u)?.[1];
  if (cidMatch) return cidMatch;

  return decoded.match(/\/go\/(?:ennm|jump)\/?(\d+)?/u)?.[1] ?? decoded.match(/\/(\d+)(?:\.html)?(?:[?#].*)?$/u)?.[1] ?? "";
}

function extractMangaSlugFromMangaId(mangaId: string): string {
  const normalized = normalizeMangaId(mangaId);
  const match = normalized.match(/^manga\/(.+?)\.html$/u);
  return match?.[1] ?? "";
}

function extractMangaSlugFromChapterId(chapterId: string): string {
  const normalized = normalizeChapterId(chapterId);
  const match = normalized.match(/^chapter\/(.+)\/[^/]+$/u);
  return match?.[1] ?? "";
}

function decodeHtmlEntities(value: string): string {
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

function isChapterId(value: string): boolean {
  return value === "chapter" || value.startsWith("chapter/") || value.includes("/chapter/") || value.startsWith("c/") || value.includes("/c/");
}

function isPlaceholderImage(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.startsWith("data:image/") || normalized.includes("blank") || normalized.includes("placeholder");
}

function normalizeStatus(value: string): string {
  const cleaned = cleanText(value);
  const normalized = cleaned.toLowerCase();

  if (!cleaned) return "Unknown";
  if (/complete|complet|completo|termin|finito|finished|conclus/iu.test(normalized)) return "Completed";
  if (/ongoing|in corso|corso|attivo|continua|continuing|serializz/iu.test(normalized)) return "Ongoing";
  if (/hiatus|pausa|sospes/iu.test(normalized)) return "Hiatus";
  if (/drop|dropped|cancel|cancell/iu.test(normalized)) return "Dropped";

  return cleaned;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
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
  return decodeHtmlEntities(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseDate(value: string): Date | undefined {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;

  const isoMatch = cleaned.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/u);
  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1] ?? "", 10);
    const month = Number.parseInt(isoMatch[2] ?? "", 10) - 1;
    const day = Number.parseInt(isoMatch[3] ?? "", 10);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const europeanMatch = cleaned.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/u);
  if (europeanMatch) {
    const day = Number.parseInt(europeanMatch[1] ?? "", 10);
    const month = Number.parseInt(europeanMatch[2] ?? "", 10) - 1;
    const year = Number.parseInt(europeanMatch[3] ?? "", 10);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function extractChapterNumber(title: string): number {
  const cleaned = cleanText(title);
  const explicitChapter = cleaned.match(/(?:ch(?:apter)?\.?|cap(?:itolo)?\.?|cap[ií]tulo\.?|vol\.[^\d]*)\s*(\d+(?:\.\d+)?)/iu)?.[1];
  const fallbackNumber = cleaned.match(/(\d+(?:\.\d+)?)/u)?.[1];
  const parsed = Number.parseFloat(explicitChapter ?? fallbackNumber ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export const NineManga = new NineMangaExtension();
