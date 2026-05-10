import { normalizeUrl } from "./urls";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"] as const;

export function normalizeImageUrl(value: string | undefined, baseUrl: string): string {
  if (!value) return "";
  return normalizeUrl(value, baseUrl);
}

export function hasKnownImageExtension(value: string): boolean {
  const pathname = new URL(value).pathname.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}
