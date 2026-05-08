const fs = require('fs')
const path = require('path')

const fixtureDir = path.join(process.cwd(), 'fixtures', 'readallcomics')

function read(name) {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf8')
}

function write(name, content) {
  fs.writeFileSync(path.join(fixtureDir, name), `${content.trim()}\n`, 'utf8')
  console.log(`Created fixtures/readallcomics/${name} (${content.trim().length} chars)`)
}

function stripNoise(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractBetween(html, startPattern, endPattern) {
  const start = html.search(startPattern)
  if (start < 0) return ''
  const rest = html.slice(start)
  const end = rest.search(endPattern)
  return end < 0 ? rest : rest.slice(0, end)
}

function extractFirstNListItems(html, count = 5) {
  const ul = extractBetween(html, /<ul[^>]+class=["'][^"']*list-story[^"']*categories[^"']*["'][^>]*>/i, /<\/ul>/i)
  if (!ul) return ''

  const items = ul.match(/<li\b[\s\S]*?<\/li>/gi) || []
  return `<ul class="list-story categories">\n${items.slice(0, count).join('\n')}\n</ul>`
}

function extractIssueLinks(html, count = 60) {
  const candidates = html.match(/<a\b[^>]+href=["']https:\/\/readallcomics\.com\/(?!category\/|page\/|tag\/|author\/|wp-|report-error|request-comics|vip-ad-free|new-comments|wp-json|xmlrpc\.php)[^"']+\/["'][\s\S]*?<\/a>/gi) || []
  const seen = new Set()
  const unique = []

  for (const link of candidates) {
    const href = decodeHtmlEntities(link.match(/href=["']([^"']+)["']/i)?.[1] || '')
    const label = link.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    if (!href || !label || seen.has(href)) continue

    seen.add(href)
    unique.push(`<a href="${href}">${label}</a>`)
    if (unique.length >= count) break
  }

  return unique.join('\n')
}

function extractPagination(html) {
  const matches = html.match(/<a[^>]+href=["'][^"']*(?:\/page\/\d+\/|paged=\d+)[^"']*["'][\s\S]*?<\/a>/gi) || []
  const rels = html.match(/<link[^>]+rel=["'](?:next|prev)["'][^>]*>/gi) || []
  return [...rels, ...matches].join('\n')
}

function extractReaderCore(cleanHtml, originalHtml) {
  const category = cleanHtml.match(/<div[^>]+class=["'][^"']*pinbin-category[^"']*["'][\s\S]*?<\/div>/i)?.[0] || ''
  const title = cleanHtml.match(/<h[1-6][^>]*>\s*<strong>[\s\S]*?<\/strong>\s*<\/h[1-6]>/i)?.[0]
    || cleanHtml.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)?.[0]
    || cleanHtml.match(/<h3[^>]*>[\s\S]*?<\/h3>/i)?.[0]
    || ''
  const entryContent = cleanHtml.match(/<div[^>]+class=["'][^"']*(?:entry-content|post-content|postarea|single-content)[^"']*["'][\s\S]*?<\/div>/i)?.[0] || ''

  const imgTags = originalHtml.match(/<img\b[^>]*>/gi) || []
  const imgUrlsFromTags = imgTags
    .map((img) => img.match(/(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/i)?.[1])
    .filter(Boolean)

  const rawUrls = originalHtml.match(/https?:\\?\/\\?\/[^"'<>\s)]+/gi) || []
  const normalizedUrls = rawUrls.map((url) => decodeHtmlEntities(url.replace(/\\\//g, '/')))

  const pageUrls = [...imgUrlsFromTags, ...normalizedUrls]
    .map((url) => decodeHtmlEntities(url || ''))
    .filter((url) => /(?:blogspot|blogger|googleusercontent|bp\.blogspot|lh\d+\.googleusercontent)/i.test(url))
    .filter((url) => !/logo|icon|avatar|readallcomics-1|cropped-logo/i.test(url))

  const seen = new Set()
  const uniquePageUrls = []
  for (const url of pageUrls) {
    if (seen.has(url)) continue
    seen.add(url)
    uniquePageUrls.push(url)
    if (uniquePageUrls.length >= 80) break
  }

  return [
    '<!-- category -->',
    category,
    '<!-- title -->',
    title,
    '<!-- entry content candidate -->',
    entryContent,
    '<!-- first 80 candidate page image urls from original HTML -->',
    ...uniquePageUrls
  ].join('\n')
}

const home = stripNoise(read('clean-home.html'))
const page2 = stripNoise(read('clean-page-2.html'))
const search = stripNoise(read('clean-search-batman.html'))
const readerClean = stripNoise(read('clean-comic-reader.html'))
const readerOriginal = read('comic-reader.html')
const categoryBatmanClean = fs.existsSync(path.join(fixtureDir, 'clean-category-batman.html'))
  ? stripNoise(read('clean-category-batman.html'))
  : stripNoise(read('category-batman.html'))
const categoryBatmanOriginal = read('category-batman.html')

write('analysis-home-list.html', [
  extractFirstNListItems(home, 8),
  '<!-- pagination -->',
  extractPagination(home)
].join('\n'))

write('analysis-page-2-list.html', [
  extractFirstNListItems(page2, 8),
  '<!-- pagination -->',
  extractPagination(page2)
].join('\n'))

write('analysis-search-batman-list.html', [
  extractFirstNListItems(search, 12),
  '<!-- pagination -->',
  extractPagination(search)
].join('\n'))

write('analysis-category-batman-issues.html', [
  '<!-- first issue links from clean category -->',
  extractIssueLinks(categoryBatmanClean, 60),
  '<!-- first issue links from original category -->',
  extractIssueLinks(categoryBatmanOriginal, 60),
  '<!-- pagination -->',
  extractPagination(categoryBatmanOriginal)
].join('\n'))

write('analysis-comic-reader-core.html', extractReaderCore(readerClean, readerOriginal))
