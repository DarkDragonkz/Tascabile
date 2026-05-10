import { HttpStatusError } from "./errors";

export interface HttpResponseLike {
  status: number;
}

export function assertSuccessfulStatus(url: string, response: HttpResponseLike): void {
  if (response.status < 200 || response.status >= 300) {
    throw new HttpStatusError(url, response.status);
  }
}

export function createDefaultHeaders(baseUrl: string): Record<string, string> {
  return {
    Referer: baseUrl,
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  };
}
