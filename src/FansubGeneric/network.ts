import {
  PaperbackInterceptor,
  URL,
  type Metadata,
  type Request,
  type Response,
  type SearchQuery,
} from "@paperback/types";

import type { ReadChapterResponse } from "./models";

interface CacheEntry {
  expires: number;
  value: string;
}

export class MainInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly siteRoot: string,
  ) {
    super(id);
  }

  override async interceptRequest(request: Request): Promise<Request> {
    const url = request.url.replace(/^http:\/\//u, "https://");
    const isImage = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/iu.test(url);
    request.url = url;
    request.headers = {
      ...request.headers,
      Referer: `${this.siteRoot}/`,
      "User-Agent": await Application.getDefaultUserAgent(),
      ...(isImage
        ? { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }
        : { Accept: "application/json,text/plain,*/*" }),
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

export class APIRequests {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(public readonly apiBaseUrl: string) {}

  clearCache(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  private async fetchText(url: string, cacheSeconds: number): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(url);
    if (cached && cached.expires > now) return cached.value;
    if (cached) this.cache.delete(url);

    const pending = this.inFlight.get(url);
    if (pending) return pending;

    const request = (async () => {
      const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
      if (response.status >= 400) throw new Error(`HTTP ${response.status}: ${url}`);
      const value = Application.arrayBufferToUTF8String(data);
      if (cacheSeconds > 0) {
        if (this.cache.size >= 64) {
          const oldestKey = this.cache.keys().next().value as string | undefined;
          if (oldestKey) this.cache.delete(oldestKey);
        }
        this.cache.set(url, { expires: Date.now() + cacheSeconds * 1000, value });
      }
      return value;
    })();

    this.inFlight.set(url, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(url);
    }
  }

  async apiSearchResult(query: SearchQuery<Metadata>): Promise<string> {
    const searchApi = new URL(this.apiBaseUrl);
    const title = query.title.trim();
    searchApi.addPathComponent(title.length > 0 ? "search" : "comics");
    if (title.length > 0) searchApi.addPathComponent(title);
    return this.fetchText(searchApi.toString(), title.length > 0 ? 15 : 60);
  }

  async apiMangaDetails(mangaId: string, section = false): Promise<string> {
    const searchApi = new URL(this.apiBaseUrl);
    searchApi.addPathComponent("comics");
    if (!section && mangaId.length > 0) searchApi.addPathComponent(mangaId);
    return this.fetchText(searchApi.toString(), section ? 60 : 120);
  }

  async getChapterPages(chapterId: string): Promise<string[]> {
    const searchApi = new URL(this.apiBaseUrl);
    searchApi.addPathComponent(chapterId);
    const raw = await this.fetchText(searchApi.toString(), 180);
    return (JSON.parse(raw) as ReadChapterResponse).chapter.pages;
  }
}
