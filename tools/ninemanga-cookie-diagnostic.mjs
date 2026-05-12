#!/usr/bin/env node

const targetUrl = process.argv[2] || "https://www.ninemanga.com/chapter/Painter+of+the+Night/6220291-10-1.html";

const USER_AGENTS = {
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  mobile:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

function headersFor(url, userAgent, cookie = "") {
  const origin = new URL(url).origin;
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,it;q=0.8",
    referer: `${origin}/`,
    "user-agent": userAgent,
    ...(cookie ? { cookie } : {}),
  };
}

function parseSetCookie(headers) {
  const cookies = [];
  const raw = headers.get("set-cookie") || "";

  for (const part of raw.split(/,(?=\s*[^;,\s]+=)/g)) {
    const pair = part.split(";")[0]?.trim();
    if (!pair || !pair.includes("=")) continue;
    const [name, ...valueParts] = pair.split("=");
    cookies.push({ name, value: valueParts.join("=") });
  }

  return cookies;
}

function toCookieHeader(cookies) {
  const latest = new Map();
  for (const cookie of cookies) latest.set(cookie.name, cookie.value);
  return [...latest.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function summarizeHtml(html) {
  return {
    bytes: html.length,
    sourceGate: /Choose a source to start reading/i.test(html),
    hasReaderImages: /pic_box|manga_pic|pic_download|movietop\.cc/i.test(html),
    hasCloudflareChallenge: /challenge-platform|cf-chl|__CF\$cv/i.test(html),
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "",
  };
}

async function requestOnce(label, url, userAgent, cookie = "") {
  const response = await fetch(url, {
    redirect: "manual",
    headers: headersFor(url, userAgent, cookie),
  });
  const html = await response.text();
  const receivedCookies = parseSetCookie(response.headers);

  console.log(`\n=== ${label} ===`);
  console.log(`url: ${url}`);
  console.log(`status: ${response.status}`);
  console.log(`location: ${response.headers.get("location") || ""}`);
  console.log(`sent cookie names: ${cookie ? cookie.split(";").map((x) => x.trim().split("=")[0]).join(", ") : "none"}`);
  console.log(`received cookie names: ${receivedCookies.map((cookie) => cookie.name).join(", ") || "none"}`);
  console.log(JSON.stringify(summarizeHtml(html), null, 2));

  return { html, receivedCookies };
}

async function runScenario(name, userAgent) {
  console.log(`\n######## ${name.toUpperCase()} ########`);

  const first = await requestOnce(`${name} first request`, targetUrl, userAgent);
  const cookieHeader = toCookieHeader(first.receivedCookies);

  if (!cookieHeader) {
    console.log("No cookies received; cannot run cookie replay test.");
    return;
  }

  await requestOnce(`${name} second request with replayed cookies`, targetUrl, userAgent, cookieHeader);
}

await runScenario("desktop", USER_AGENTS.desktop);
await runScenario("mobile", USER_AGENTS.mobile);
