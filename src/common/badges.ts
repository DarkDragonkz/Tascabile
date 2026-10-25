import type { SourceBadge } from "@paperback/types";

// Repository badges shared by every source: content type first, then language,
// with the same label and colour everywhere. The Comics readers are generated, so
// scripts/customize-comic-readers.mjs repeats `comics` and `english` literally.
export const BADGES = {
  manga: { label: "Manga", textColor: "#ffffff", backgroundColor: "#5965f2" },
  fansub: { label: "Fansub", textColor: "#ffffff", backgroundColor: "#8e44ad" },
  comics: { label: "Comics", textColor: "#ffffff", backgroundColor: "#263238" },
  italian: { label: "IT 🇮🇹", textColor: "#ffffff", backgroundColor: "#009246" },
  english: { label: "EN 🇬🇧", textColor: "#ffffff", backgroundColor: "#012169" },
  multilingual: { label: "Multilingua", textColor: "#ffffff", backgroundColor: "#607d8b" },
} satisfies Record<string, SourceBadge>;
