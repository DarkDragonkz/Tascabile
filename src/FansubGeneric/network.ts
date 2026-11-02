import {
  CloudflareError,
  PaperbackInterceptor,
  URL,
  type Request,
  type Response,
} from "@paperback/types";

import { RequestCache } from "../common/requestCache";
import type { ComicDetail, ComicListItem } from "./models";
import { parseChapterPages, parseComicDetail, parseComicList } from "./validation";

const IMAGE_URL = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/iu;
// One banner at a time: parallel Home sections would otherwise each open one, and a
// challenge that comes back right after a completed check must not loop.
const BYPASS_PROMPT_INTERVAL_MS = 30_000;

function header(response: Response, name: string): string | undefined {
  const headers = response.headers ?? {};
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
}

/** Cloudflare's managed challenge ("Just a moment…"), as served instead of the API's JSON. */
export function isChallengePage(html: string): boolean {
  return /<title>\s*(?:Just a moment|Attention Required)/iu.test(html) || html.includes("cf-chl-");
}

export function isChallengeResponse(response: Response, body: () => string): boolean {
  if (header(response, "cf-mitigated") === "challenge") return true;
  return (response.status === 403 || response.status === 503) && isChallengePage(body());
}

export class MainInterceptor extends PaperbackInterceptor {
  private lastBypassPromptAt = 0;

  constructor(
    id: string,
    private readonly siteRoot: string,
  ) {
    super(id);
  }

  markBypassCompleted(): void {
    this.lastBypassPromptAt = 0;
  }

  override async interceptRequest(request: Request): Promise<Request> {
    const url = request.url.replace(/^http:\/\//u, "https://");
    request.url = url;
    request.headers = {
      ...request.headers,
      Referer: `${this.siteRoot}/`,
      // The same User-Agent goes to the Cloudflare check below: `cf_clearance` is tied to it.
      "User-Agent": await Application.getDefaultUserAgent(),
      ...(IMAGE_URL.test(url)
        ? { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }
        : { Accept: "application/json,text/plain,*/*" }),
    };
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    // Only the reader's own API and pages can open the check; images simply fail.
    if (!request.url.startsWith(`${this.siteRoot}/`) || IMAGE_URL.test(request.url)) return data;
    if (!isChallengeResponse(response, () => Application.arrayBufferToUTF8String(data))) {
      return data;
    }
    if (Date.now() - this.lastBypassPromptAt < BYPASS_PROMPT_INTERVAL_MS) {
      throw new Error("Verifica Cloudflare già in corso. Completa il banner aperto e riprova.");
    }
    this.lastBypassPromptAt = Date.now();
    throw new CloudflareError({
      url: `${this.siteRoot}/`,
      method: "GET",
      headers: { "User-Agent": await Application.getDefaultUserAgent() },
    });
  }
}

/**
 * The `/search/<title>` path segment, or undefined when the readers cannot answer it:
 * below three letters they return nothing, and a slash is rejected even encoded
 * (`%2F` → 404 on Apache). Composed and decomposed accents are sent the same way (NFC).
 */
export function searchSegment(title: string): string | undefined {
  const normalized = title.normalize("NFC").trim();
  // Characters as read: a base character with its combining marks counts once.
  const characters = normalized.match(/\P{Mark}\p{Mark}*/gu)?.length ?? 0;
  if (characters < 3) return undefined;
  if (/[/\\]/u.test(normalized) || /^\.+$/u.test(normalized)) return undefined;
  return encodeURIComponent(normalized);
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
      return Application.arrayBufferToUTF8String(data);
    });
  }

  private url(...components: string[]): string {
    const url = new URL(this.apiBaseUrl);
    for (const component of components) url.addPathComponent(component);
    return url.toString();
  }

  /** The whole catalogue (`/comics`). */
  async catalog(): Promise<ComicListItem[]> {
    return parseComicList(await this.fetchText(this.url("comics"), 60));
  }

  /** Server-side search; `segment` comes from {@link searchSegment}. */
  async search(segment: string): Promise<ComicListItem[]> {
    return parseComicList(await this.fetchText(this.url("search", segment), 15), "Ricerca");
  }

  async comic(slug: string): Promise<ComicDetail> {
    return parseComicDetail(
      await this.fetchText(this.url("comics", encodeURIComponent(slug)), 120),
    );
  }

  /** `chapterId` is the chapter's API path (`/read/<slug>/it/vol/1/ch/2`). */
  async getChapterPages(chapterId: string): Promise<string[]> {
    return parseChapterPages(await this.fetchText(this.url(chapterId), 180));
  }
}
