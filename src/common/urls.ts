export function normalizeUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  return new URL(trimmed, baseUrl).toString();
}

export function removeTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

export function getLastPathComponent(value: string): string {
  const parsedUrl = new URL(value);
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  return pathParts.at(-1) ?? "";
}
