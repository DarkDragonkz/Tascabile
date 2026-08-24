import {
  PaperbackInterceptor,
  URL,
  type JSONValue,
  type Request,
  type Response,
  type SearchQuery,
} from "@paperback/types";

import type { ReadChapterResponse } from "./models";

export class MainInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    return {
      ...request,
      url: request.url.replace(/^http:\/\//u, "https://"),
    };
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
  apiBaseUrl: string;

  constructor(baseUrl: string) {
    this.apiBaseUrl = baseUrl;
  }

  async apiSearchResult(query: SearchQuery<JSONValue>): Promise<string> {
    const searchApi = new URL(this.apiBaseUrl);
    const title = query.title.trim();
    searchApi.addPathComponent(title.length > 0 ? "search" : "comics");
    if (title.length > 0) searchApi.addPathComponent(title);
    const [, data] = await Application.scheduleRequest({
      url: searchApi.toString(),
      method: "GET",
    });
    return Application.arrayBufferToUTF8String(data);
  }

  async apiMangaDetails(mangaId: string, section = false): Promise<string> {
    const searchApi = new URL(this.apiBaseUrl);
    searchApi.addPathComponent("comics");
    if (!section && mangaId.length > 0) searchApi.addPathComponent(mangaId);
    const [, data] = await Application.scheduleRequest({
      url: searchApi.toString(),
      method: "GET",
    });
    return Application.arrayBufferToUTF8String(data);
  }

  async getChapterPages(chapterId: string): Promise<string[]> {
    const searchApi = new URL(this.apiBaseUrl);
    searchApi.addPathComponent(chapterId);
    const [, data] = await Application.scheduleRequest({
      url: searchApi.toString(),
      method: "GET",
    });
    const json = JSON.parse(Application.arrayBufferToUTF8String(data)) as ReadChapterResponse;
    return json.chapter.pages;
  }
}
