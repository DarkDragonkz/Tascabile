#!/usr/bin/env node

const DEFAULT_URL = "https://www.ninemanga.com/chapter/Painter+of+the+Night/6220291-10-1.html";

const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const targetUrl = process.argv[2] || DEFAULT_URL;
const maxDepth = Number(process.argv[3] || 3);

function headersFor(url, userAgent) {
  const origin = new URL(url).origin;
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,it;q=0.8",
    referer: `${origin}/`,
    "user-agent": userAgent,
  };
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#038;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function normalizeUrl(value, baseUrl) {
  const trimmed = decodeHtmlEntities(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return "";
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([a-zA-Z0-9:_-]+)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[2]);
  }
  return attrs;
}

function analyzeHtml(html, baseUrl) {
  const sourceGate = /Choose a source to start reading/i.test(html);
  const imageUrls = [];
  const links = [];
  const scripts = [];
  const iframes = [];
  const variables = [];

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = extractAttributes(match[0]);
    const candidate = attrs.src || attrs["data-original"] || attrs["data-src"] || attrs["data-lazy-src"] || "";
    const url = normalizeUrl(candidate, baseUrl);
    if (/\.(webp|jpe?g|png|gif)([?#].*)?$/i.test(url) || /movietop\.cc|\/comics\//i.test(url)) imageUrls.push(url);
  }

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) links.push(normalizeUrl(match[1], baseUrl));
  for (const match of html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) scripts.push(normalizeUrl(match[1], baseUrl));
  for (const match of html.matchAll(/<iframe\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) iframes.push(normalizeUrl(match[1], baseUrl));

  for (const name of ["book_id", "chapter_id", "list_num", "pre_page_url", "next_page_url", "all_imgs_url"]) {
    const re = new RegExp(`\\bvar\\s+${name}\\s*=\\s*([^;]+);`, "i");
    const match = html.match(re);
    if (match) variables.push(`${name} = ${match[1].trim()}`);
  }

  return {
    sourceGate,
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "",
    length: html.length,
    imageUrls: unique(imageUrls),
    sourceLinks: unique(links.filter((url) => /\/go\/ennm\/|type=enninemanga|financemasterpro|sweettoothrecipes/i.test(url))),
    readerLinks: unique(links.filter((url) => /ninemanga\.com\/chapter\//i.test(url))),
    scripts: unique(scripts),
    iframes: unique(iframes),
    variables,
    containsMovietop: /movietop\.cc/i.test(html),
    containsPicBox: /pic_box|manga_pic|pic_download/i.test(html),
  };
}

async function fetchWithLog(url, label, userAgent) {
  const response = await fetch(url, { redirect: "manual", headers: headersFor(url, userAgent) });
  const contentType = response.headers.get("content-type") || "";
  const location = response.headers.get("location") || "";
  const setCookie = response.headers.get("set-cookie") || "";
  const body = contentType.includes("text") || contentType.includes("html") ? await response.text() : "";
  return {
    label,
    requestedUrl: url,
    status: response.status,
    finalUrl: response.url,
    location: normalizeUrl(location, url),
    contentType,
    setCookieNames: unique([...setCookie.matchAll(/(?:^|,\s*)([^=;,\s]+)=/g)].map((m) => m[1])),
    html: body,
    analysis: body ? analyzeHtml(body, response.url || url) : undefined,
  };
}

function printResult(result) {
  console.log(`\n=== ${result.label} ===`);
  console.log(`requested: ${result.requestedUrl}`);
  console.log(`status: ${result.status}`);
  console.log(`responseUrl: ${result.finalUrl}`);
  if (result.location) console.log(`location: ${result.location}`);
  console.log(`content-type: ${result.contentType}`);
  if (result.setCookieNames.length) console.log(`set-cookie names: ${result.setCookieNames.join(", ")}`);
  const analysis = result.analysis;
  if (!analysis) return;
  console.log(`title: ${analysis.title}`);
  console.log(`html length: ${analysis.length}`);
  console.log(`source gate: ${analysis.sourceGate}`);
  console.log(`contains pic_box/manga_pic/pic_download: ${analysis.containsPicBox}`);
  console.log(`contains movietop.cc: ${analysis.containsMovietop}`);
  if (analysis.variables.length) console.log(`vars:\n  ${analysis.variables.join("\n  ")}`);
  if (analysis.imageUrls.length) console.log(`images (${analysis.imageUrls.length}):\n  ${analysis.imageUrls.slice(0, 20).join("\n  ")}`);
  if (analysis.sourceLinks.length) console.log(`source links:\n  ${analysis.sourceLinks.join("\n  ")}`);
  if (analysis.readerLinks.length) console.log(`reader links:\n  ${analysis.readerLinks.slice(0, 20).join("\n  ")}`);
  if (analysis.iframes.length) console.log(`iframes:\n  ${analysis.iframes.join("\n  ")}`);
  if (analysis.scripts.length) console.log(`scripts:\n  ${analysis.scripts.slice(0, 30).join("\n  ")}`);
}

async function run() {
  console.log(`NineManga reader diagnostic`);
  console.log(`target: ${targetUrl}`);
  console.log(`max source depth: ${maxDepth}`);
  const queue = [];
  const seen = new Set();

  for (const [label, ua] of [["desktop initial", DESKTOP_USER_AGENT], ["mobile initial", MOBILE_USER_AGENT]]) {
    const result = await fetchWithLog(targetUrl, label, ua);
    printResult(result);
    for (const link of result.analysis?.sourceLinks || []) queue.push({ url: link, label: `source from ${label}`, depth: 1, ua });
  }

  while (queue.length > 0) {
    const item = queue.shift();
    const key = `${item.depth}:${item.url}`;
    if (!item || seen.has(key) || item.depth > maxDepth) continue;
    seen.add(key);
    try {
      const result = await fetchWithLog(item.url, `${item.label} depth ${item.depth}`, item.ua);
      printResult(result);
      if (result.location) queue.push({ url: result.location, label: "redirect location", depth: item.depth + 1, ua: item.ua });
      for (const link of result.analysis?.sourceLinks || []) queue.push({ url: link, label: "nested source", depth: item.depth + 1, ua: item.ua });
      for (const iframe of result.analysis?.iframes || []) queue.push({ url: iframe, label: "iframe", depth: item.depth + 1, ua: item.ua });
    } catch (error) {
      console.log(`\n=== failed ${item.url} ===`);
      console.log(error instanceof Error ? error.stack : error);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
