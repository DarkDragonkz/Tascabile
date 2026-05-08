#!/usr/bin/env python3
"""
Diagnostica ReadAllComics + repository Paperback.

Cosa controlla:
1. Scarica HTML reali da ReadAllComics.
2. Salva HTML raw e clean.
3. Conta selettori utili alla source.
4. Estrae serie, capitoli e immagini candidate.
5. Verifica se la repo Paperback pubblicata espone versioning.json.
6. Verifica se versioning.json contiene ReadAllComics.
7. Prova a scaricare i file indicati dal versioning.json.

Uso base:
    python scripts/debug_readallcomics.py

Uso con repo Paperback pubblicata:
    python scripts/debug_readallcomics.py --repo-url https://darkdragonkz.github.io/Tascabile/0.8

Uso con parametri custom:
    python scripts/debug_readallcomics.py --story Batman --category batman --chapter batman-v1-annual-001
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen

READALL_BASE_URL = "https://readallcomics.com"

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
    "Referer": f"{READALL_BASE_URL}/",
    "Origin": READALL_BASE_URL,
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}

BLOCK_PATTERNS = [
    "cloudflare",
    "cf-browser-verification",
    "checking your browser",
    "attention required",
    "just a moment",
    "enable javascript and cookies",
    "access denied",
    "error 1020",
    "captcha",
]

BODY_RE = re.compile(r"<body\b[\s\S]*?</body>", re.IGNORECASE)
SCRIPT_STYLE_RE = re.compile(r"<(script|style|noscript)\b[\s\S]*?</\1>", re.IGNORECASE)
COMMENT_RE = re.compile(r"<!--[\s\S]*?-->")
TAG_RE = re.compile(r"<[^>]+>")
IMG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE | re.DOTALL)
LINK_RE = re.compile(r"<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.IGNORECASE | re.DOTALL)
ANY_A_RE = re.compile(r"<a\b[^>]*>[\s\S]*?</a>", re.IGNORECASE | re.DOTALL)
IMAGE_URL_RE = re.compile(r"https?:\\?/\\?/[^\"'<>\s)]+", re.IGNORECASE)


@dataclass
class FetchResult:
    url: str
    status: int | None
    final_url: str | None
    text: str
    error: str | None


@dataclass
class PageReport:
    name: str
    url: str
    status: int | None = None
    final_url: str | None = None
    error: str | None = None
    title: str | None = None
    raw_chars: int = 0
    clean_chars: int = 0
    blocked: bool = False
    block_reasons: list[str] = field(default_factory=list)
    selector_counts: dict[str, int] = field(default_factory=dict)
    series: list[dict[str, str | None]] = field(default_factory=list)
    chapters: list[dict[str, str | None]] = field(default_factory=list)
    images: list[str] = field(default_factory=list)
    raw_file: str | None = None
    clean_file: str | None = None


@dataclass
class RepoReport:
    repo_url: str | None = None
    checked: bool = False
    versioning_url: str | None = None
    status: int | None = None
    error: str | None = None
    sources: list[str] = field(default_factory=list)
    readallcomics_present: bool = False
    source_file_checks: list[dict[str, Any]] = field(default_factory=list)


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "page"


def strip_tags(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub(" ", value))).strip()


def clean_html(raw: str) -> str:
    body_match = BODY_RE.search(raw)
    body = body_match.group(0) if body_match else raw
    cleaned = SCRIPT_STYLE_RE.sub("", body)
    cleaned = COMMENT_RE.sub("", cleaned)
    cleaned = cleaned.replace("\r\n", "\n")
    cleaned = re.sub(r"\n[ \t]+", "\n", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip() + "\n"


def fetch_url(url: str, timeout: int = 30, retries: int = 2, sleep: float = 1.0) -> FetchResult:
    last_error: str | None = None
    for attempt in range(1, retries + 1):
        req = Request(url, headers=DEFAULT_HEADERS, method="GET")
        try:
            with urlopen(req, timeout=timeout) as response:
                raw = response.read()
                charset = response.headers.get_content_charset() or "utf-8"
                text = raw.decode(charset, errors="replace")
                return FetchResult(url=url, status=response.status, final_url=response.geturl(), text=text, error=None)
        except HTTPError as err:
            text = ""
            try:
                text = err.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            return FetchResult(url=url, status=err.code, final_url=url, text=text, error=f"HTTPError {err.code}: {err.reason}")
        except URLError as err:
            last_error = f"URLError: {err.reason}"
        except Exception as err:  # noqa: BLE001
            last_error = f"{type(err).__name__}: {err}"
        if attempt < retries:
            time.sleep(sleep)
    return FetchResult(url=url, status=None, final_url=None, text="", error=last_error)


def find_title(raw: str) -> str | None:
    match = re.search(r"<title[^>]*>(.*?)</title>", raw, re.IGNORECASE | re.DOTALL)
    return strip_tags(match.group(1)) if match else None


def detect_block(raw: str) -> tuple[bool, list[str]]:
    lower = raw.lower()
    reasons = [pattern for pattern in BLOCK_PATTERNS if pattern in lower]
    return bool(reasons), reasons


def count_regex(raw: str, pattern: str) -> int:
    return len(re.findall(pattern, raw, re.IGNORECASE | re.DOTALL))


def attr(tag: str, name: str) -> str | None:
    match = re.search(rf"\b{re.escape(name)}=[\"']([^\"']+)[\"']", tag, re.IGNORECASE)
    return html.unescape(match.group(1)).strip() if match else None


def class_contains(tag: str, class_name: str) -> bool:
    class_value = attr(tag, "class") or ""
    return class_name in class_value.split()


def normalize_url(url: str) -> str:
    return html.unescape(url.replace(r"\/", "/")).strip()


def extract_category_id(url: str | None) -> str | None:
    if not url:
        return None
    match = re.search(r"/category/([^/?#]+)/?", html.unescape(url))
    return match.group(1) if match else None


def extract_post_id(url: str | None) -> str | None:
    if not url:
        return None
    decoded = html.unescape(url)
    if any(part in decoded for part in ["/category/", "/page/", "/tag/", "/author/", "/wp-"]):
        return None
    match = re.search(r"readallcomics\.com/([^/?#]+)/?", decoded)
    if not match:
        return None
    slug = match.group(1)
    if slug in {"xmlrpc.php", "report-error", "request-comics", "vip-ad-free", "new-comments"}:
        return None
    return slug


def image_from_fragment(fragment: str) -> str | None:
    img_match = IMG_RE.search(fragment)
    if not img_match:
        return None
    tag = img_match.group(0)
    for name in ["data-src", "data-lazy-src", "data-original", "src"]:
        value = attr(tag, name)
        if value:
            return urljoin(READALL_BASE_URL, value)
    srcset = attr(tag, "srcset")
    if srcset:
        return urljoin(READALL_BASE_URL, srcset.split(",")[0].strip().split()[0])
    return None


def extract_series(raw: str, limit: int = 30) -> list[dict[str, str | None]]:
    results: list[dict[str, str | None]] = []
    seen: set[str] = set()

    # Layout nuovo: lista serie/categorie. Non assumere ordine attributi href/class.
    for li in re.findall(r"<li\b[^>]*>[\s\S]*?</li>", raw, re.IGNORECASE):
        if "cat-title" not in li and "book-link" not in li:
            continue

        title_anchor = None
        for anchor in ANY_A_RE.findall(li):
            if class_contains(anchor, "cat-title"):
                title_anchor = anchor
                break

        if not title_anchor:
            continue

        href = attr(title_anchor, "href")
        series_id = extract_category_id(href)
        title = strip_tags(title_anchor)

        if series_id and title and series_id not in seen:
            seen.add(series_id)
            results.append({"id": series_id, "title": title, "href": html.unescape(href or ""), "image": image_from_fragment(li)})
            if len(results) >= limit:
                return results

    # Layout classico funzionante nello zip: #post-area .post.
    post_blocks = re.findall(r"<(?:article|div)[^>]+class=[\"'][^\"']*\bpost\b[^\"']*[\"'][^>]*>[\s\S]*?</(?:article|div)>", raw, re.IGNORECASE)
    for post in post_blocks:
        class_match = re.search(r"class=[\"']([^\"']+)[\"']", post, re.IGNORECASE)
        class_attr = class_match.group(1) if class_match else ""
        category_match = re.search(r"(?:^|\s)category-([^\s]+)", class_attr)
        link_match = LINK_RE.search(post)
        href = html.unescape(link_match.group(1)) if link_match else None
        title = strip_tags(link_match.group(2)) if link_match else ""
        series_id = category_match.group(1) if category_match else extract_category_id(href) or extract_post_id(href)
        if series_id and title and series_id not in seen:
            seen.add(series_id)
            results.append({"id": series_id, "title": title, "href": href, "image": image_from_fragment(post)})
            if len(results) >= limit:
                return results

    return results


def extract_chapters(raw: str, limit: int = 100) -> list[dict[str, str | None]]:
    chapters: list[dict[str, str | None]] = []
    seen: set[str] = set()
    for href, label_html in LINK_RE.findall(raw):
        href = html.unescape(href)
        chapter_id = extract_post_id(href)
        title = strip_tags(label_html)
        if chapter_id and title and chapter_id not in seen:
            seen.add(chapter_id)
            chapters.append({"id": chapter_id, "title": title, "href": href})
            if len(chapters) >= limit:
                break
    return chapters


def is_reader_image(url: str) -> bool:
    lower = url.lower().split("?")[0]
    if any(noise in lower for noise in ["logo", "icon", "avatar", "readallcomics-1", "cropped-logo", "facebook", "twitter"]):
        return False
    return any(host in lower for host in ["blogspot.", "blogger.googleusercontent.com", "googleusercontent.com", "bp.blogspot", "lh3.googleusercontent", "s3.amazonaws.com/comicgeeks"])


def extract_images(raw: str, limit: int = 100) -> list[str]:
    images: list[str] = []
    seen: set[str] = set()

    for img_tag in IMG_RE.findall(raw):
        for name in ["data-src", "data-lazy-src", "data-original", "src"]:
            value = attr(img_tag, name)
            if value:
                candidate = urljoin(READALL_BASE_URL, value)
                if is_reader_image(candidate) and candidate not in seen:
                    seen.add(candidate)
                    images.append(candidate)
        srcset = attr(img_tag, "srcset")
        if srcset:
            candidate = urljoin(READALL_BASE_URL, srcset.split(",")[0].strip().split()[0])
            if is_reader_image(candidate) and candidate not in seen:
                seen.add(candidate)
                images.append(candidate)

    for raw_url in IMAGE_URL_RE.findall(raw):
        candidate = normalize_url(raw_url)
        if is_reader_image(candidate) and candidate not in seen:
            seen.add(candidate)
            images.append(candidate)
        if len(images) >= limit:
            break
    return images[:limit]


def selector_counts(raw: str) -> dict[str, int]:
    return {
        "#post-area": count_regex(raw, r"id=[\"']post-area[\"']"),
        "post class approx": count_regex(raw, r"class=[\"'][^\"']*\bpost\b[^\"']*[\"']"),
        "ul.list-story.categories": count_regex(raw, r"<ul[^>]+class=[\"'][^\"']*list-story[^\"']*categories[^\"']*[\"']"),
        "a.cat-title": count_regex(raw, r"class=[\"'][^\"']*cat-title[^\"']*[\"']"),
        "a.latest-chapter": count_regex(raw, r"class=[\"'][^\"']*latest-chapter[^\"']*[\"']"),
        "pinbin-category": count_regex(raw, r"pinbin-category"),
        "img tags": count_regex(raw, r"<img\b"),
        "reader image urls": len(extract_images(raw, 10000)),
    }


def inspect_page(name: str, url: str, output_dir: Path, args: argparse.Namespace) -> PageReport:
    print(f"Fetching {name}: {url}")
    result = fetch_url(url, args.timeout, args.retries, args.sleep)
    report = PageReport(name=name, url=url, status=result.status, final_url=result.final_url, error=result.error)

    if not result.text:
        return report

    raw = result.text
    cleaned = clean_html(raw)
    safe_name = slugify(name)
    raw_file = output_dir / f"{safe_name}.raw.html"
    clean_file = output_dir / f"{safe_name}.clean.html"
    raw_file.write_text(raw, encoding="utf-8")
    clean_file.write_text(cleaned, encoding="utf-8")

    blocked, reasons = detect_block(raw)
    report.title = find_title(raw)
    report.raw_chars = len(raw)
    report.clean_chars = len(cleaned)
    report.blocked = blocked
    report.block_reasons = reasons
    report.selector_counts = selector_counts(raw)
    report.series = extract_series(raw)
    report.chapters = extract_chapters(raw)
    report.images = extract_images(raw)
    report.raw_file = str(raw_file)
    report.clean_file = str(clean_file)
    return report


def build_readall_targets(story: str, category: str, chapter: str) -> list[tuple[str, str]]:
    return [
        ("home", f"{READALL_BASE_URL}/"),
        ("home_page_2", f"{READALL_BASE_URL}/page/2/"),
        (f"search_{slugify(story)}", f"{READALL_BASE_URL}/?story={quote(story)}&s=&type=comic"),
        (f"category_{slugify(category)}", f"{READALL_BASE_URL}/category/{category.strip('/')}/"),
        (f"chapter_{slugify(chapter)}", f"{READALL_BASE_URL}/{chapter.strip('/')}/"),
    ]


def check_paperback_repo(repo_url: str | None, args: argparse.Namespace) -> RepoReport:
    report = RepoReport(repo_url=repo_url, checked=bool(repo_url))
    if not repo_url:
        return report

    normalized = repo_url.rstrip("/")
    versioning_url = f"{normalized}/versioning.json"
    report.versioning_url = versioning_url

    result = fetch_url(versioning_url, args.timeout, args.retries, args.sleep)
    report.status = result.status
    report.error = result.error

    if result.status != 200 or not result.text:
        return report

    try:
        data = json.loads(result.text)
    except json.JSONDecodeError as error:
        report.error = f"Invalid JSON: {error}"
        return report

    sources = data.get("sources")
    if not isinstance(sources, list):
        report.error = "versioning.json has no sources list"
        return report

    for source in sources:
        if not isinstance(source, dict):
            continue
        source_id = source.get("id") or source.get("name")
        if source_id:
            report.sources.append(str(source_id))

        if str(source_id).lower() == "readallcomics":
            report.readallcomics_present = True

        candidate_paths = []
        for key in ["path", "file", "source", "content", "url"]:
            value = source.get(key)
            if isinstance(value, str):
                candidate_paths.append(value)
        for value in source.values():
            if isinstance(value, str) and (value.endswith(".js") or value.endswith(".json")):
                candidate_paths.append(value)

        for candidate in sorted(set(candidate_paths)):
            target = candidate if candidate.startswith("http") else urljoin(f"{normalized}/", candidate.lstrip("/"))
            source_result = fetch_url(target, args.timeout, 1, args.sleep)
            report.source_file_checks.append({
                "source": source_id,
                "candidate": candidate,
                "url": target,
                "status": source_result.status,
                "chars": len(source_result.text),
                "error": source_result.error,
            })

    return report


def write_reports(page_reports: list[PageReport], repo_report: RepoReport, output_dir: Path) -> None:
    data = {
        "pages": [asdict(report) for report in page_reports],
        "paperback_repo": asdict(repo_report),
    }
    (output_dir / "report.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = ["# ReadAllComics diagnostic report", ""]

    lines.extend([
        "## Paperback repository check",
        "",
        f"Repo URL: `{repo_report.repo_url}`",
        f"Checked: `{repo_report.checked}`",
        f"Versioning URL: `{repo_report.versioning_url}`",
        f"Status: `{repo_report.status}`",
        f"Error: `{repo_report.error}`",
        f"Sources: `{', '.join(repo_report.sources)}`",
        f"ReadAllComics present: `{repo_report.readallcomics_present}`",
        "",
    ])

    if repo_report.source_file_checks:
        lines.append("### Source file checks")
        for check in repo_report.source_file_checks:
            lines.append(f"- `{check['source']}` `{check['candidate']}` -> status `{check['status']}`, chars `{check['chars']}`, error `{check['error']}`")
        lines.append("")

    for report in page_reports:
        lines.extend([
            f"## {report.name}",
            "",
            f"URL: `{report.url}`",
            f"Status: `{report.status}`",
            f"Final URL: `{report.final_url}`",
            f"Error: `{report.error}`",
            f"Title: `{report.title}`",
            f"Raw chars: `{report.raw_chars}`",
            f"Clean chars: `{report.clean_chars}`",
            f"Blocked: `{report.blocked}`",
            f"Block reasons: `{', '.join(report.block_reasons)}`",
            "",
            "### Selector counts",
        ])
        for key, value in report.selector_counts.items():
            lines.append(f"- `{key}`: **{value}**")

        lines.append("\n### First series")
        for item in report.series[:15]:
            lines.append(f"- `{item.get('id')}` — {item.get('title')} — {item.get('href')}")

        lines.append("\n### First chapters")
        for item in report.chapters[:15]:
            lines.append(f"- `{item.get('id')}` — {item.get('title')} — {item.get('href')}")

        lines.append("\n### First images")
        for image in report.images[:15]:
            lines.append(f"- {image}")
        lines.append("")

    (output_dir / "report.md").write_text("\n".join(lines), encoding="utf-8")


def run(args: argparse.Namespace) -> int:
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    page_reports = [
        inspect_page(name, url, output_dir, args)
        for name, url in build_readall_targets(args.story, args.category, args.chapter)
    ]
    repo_report = check_paperback_repo(args.repo_url, args)
    write_reports(page_reports, repo_report, output_dir)

    print("\nReport written:")
    print(f"- {output_dir / 'report.md'}")
    print(f"- {output_dir / 'report.json'}")

    home = next((report for report in page_reports if report.name == "home"), None)
    chapter = next((report for report in page_reports if report.name.startswith("chapter_")), None)

    print("\nSummary:")
    print(f"- Paperback repo checked: {'YES' if repo_report.checked else 'NO'}")
    print(f"- ReadAllComics in versioning: {'YES' if repo_report.readallcomics_present else 'NO/NOT CHECKED'}")
    print(f"- Home HTTP status: {home.status if home else 'N/A'}")
    print(f"- Home blocked: {'YES' if home and home.blocked else 'NO'}")
    print(f"- Home series extracted: {len(home.series) if home else 0}")
    print(f"- Chapter images extracted: {len(chapter.images) if chapter else 0}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Debug ReadAllComics and a Paperback repository endpoint.")
    parser.add_argument("--story", default="Batman", help="Search query. Default: Batman")
    parser.add_argument("--category", default="batman", help="Category slug. Default: batman")
    parser.add_argument("--chapter", default="batman-v1-annual-001", help="Chapter/post slug. Default: batman-v1-annual-001")
    parser.add_argument("--output", default="diagnostics/readallcomics", help="Output directory")
    parser.add_argument("--repo-url", default=None, help="Paperback repository base URL, e.g. https://darkdragonkz.github.io/Tascabile/0.8")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout seconds")
    parser.add_argument("--retries", type=int, default=2, help="Retries per URL")
    parser.add_argument("--sleep", type=float, default=1.0, help="Seconds between retries")
    args = parser.parse_args()
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
