// Shapes after validation (see validation.ts): the API's raw JSON is never cast to these.

export interface ComicListItem {
  title: string;
  thumbnail: string;
  thumbnail_small?: string;
  adult: number;
  slug: string;
  author: string | null;
  alt_titles?: string[] | null;
  last_chapter?: ComicDetailChapter | null;
}

export interface Genre {
  name: string;
  slug: string;
}

export interface Team {
  name: string;
  url: string;
}

export interface ComicDetail {
  title: string;
  thumbnail: string;
  thumbnail_small: string;
  description: string | null;
  alt_titles: string[];
  author: string | null;
  artist: string | null;
  genres: Genre[];
  status: string | null;
  adult: number;
  created_at: string;
  updated_at: string;
  rating: number | null;
  target?: string | null;
  views?: number | null;
  url: string;
  slug: string;
  chapters: ComicDetailChapter[];
}

export interface ComicDetailChapter {
  id: number | null;
  full_title: string;
  title: string | null;
  volume: number | null;
  /** Null for extras such as "Oneshot" or "Artbook". */
  chapter: number | null;
  /** 24/6 is part 6 of chapter 24; null or 0 when the chapter has no part number. */
  subchapter?: number | null;
  language: string;
  teams: (Team | null)[];
  published_on: string;
  url: string;
}
