import {
  PaperbackInterceptor,
  URL,
  type Metadata,
  type Request,
  type Response,
  type SearchQuery,
} from "@paperback/types";

import { RequestCache } from "../common/requestCache";
import type { ReadChapterResponse } from "./models";

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
  private readonly cache = new RequestCache<string>();

  constructor(public readonly apiBaseUrl: string) {}

  clearCache(): void {
    this.cache.clear();
  }

  private async fetchText(url: string, cacheSeconds: number): Promise<string> {
    return this.cache.get(url, cacheSeconds, async () => {
      const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
      if (response.status >= 400) throw new Error(`HTTP ${response.status}: ${url}`);
      const value = Application.arrayBufferToUTF8String(data);
      return value;
    });
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
