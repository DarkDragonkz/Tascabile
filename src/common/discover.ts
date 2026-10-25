import type { FeaturedCarouselItem } from "@paperback/types";

type InfoItems = NonNullable<FeaturedCarouselItem["infoItems"]>;
type InfoItem = InfoItems[number];

/** SF Symbols used by the featured carousel badges. */
export const INFO_SYMBOLS = {
  chapter: "book.fill",
  date: "clock",
  type: "books.vertical.fill",
  status: "flag.fill",
  author: "person.fill",
  publisher: "building.2.fill",
  year: "calendar",
} as const;

const MONTHS_IT = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
];
const DAY_MS = 86_400_000;

/** Featured items accept at most two badges; empty texts are dropped. */
export function infoItems(
  ...items: ({ symbol: string; text: string | undefined } | undefined)[]
): InfoItems | undefined {
  const valid = items
    .filter((item): item is InfoItem => !!item?.text?.trim())
    .map((item) => ({ symbol: item.symbol, text: item.text.trim() }))
    .slice(0, 2);
  if (valid.length === 0) return undefined;
  return valid.length === 1 ? [valid[0] as InfoItem] : [valid[0] as InfoItem, valid[1] as InfoItem];
}

/** "Oggi", "Ieri", "3 giorni fa", then "12 ott 2026". */
export function relativeDateIt(date: Date | undefined, now = Date.now()): string | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  const days = Math.floor((startOfDay(now) - startOfDay(date.getTime())) / DAY_MS);
  if (days < 0) return undefined;
  if (days === 0) return "Oggi";
  if (days === 1) return "Ieri";
  if (days < 7) return `${days} giorni fa`;
  return `${date.getDate()} ${MONTHS_IT[date.getMonth()]} ${date.getFullYear()}`;
}

/** One or two lines of synopsis for the featured banner, cut on a word boundary. */
export function shortSummary(text: string | undefined, maxLength = 160): string | undefined {
  const cleaned = text?.replace(/\s+/gu, " ").trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= maxLength) return cleaned;
  const cut = cleaned.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/u, "")}…`;
}

function startOfDay(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
