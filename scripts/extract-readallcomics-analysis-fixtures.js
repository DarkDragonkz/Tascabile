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

function extractPagination(html) {
  const matches = html.match(/<a[^>]+href=["'][^"']*(?:\/page\/\d+\/|paged=\d+)[^"']*["'][\s\S]*?<\/a>/gi) || []
  const rels = html.match(/<link[^>]+rel=["'](?:next|prev)["'][^>]*>/gi) || []
  return [...rels, ...matches].join('\n')
}

function extractReaderCore(html) {
  const category = html.match(/<div[^>]+class=["'][^"']*pinbin-category[^"']*["'][\s\S]*?<\/div>/i)?.[0] || ''
  const title = html.match(/<h[1-6][^>]*>\s*<strong>[\s\S]*?<\/strong>\s*<\/h[1-6]>/i)?.[0]
    || html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)?.[0]
    || html.match(/<h3[^>]*>[\s\S]*?<\/h3>/i)?.[0]
    || ''
  const entryContent = html.match(/<div[^>]+class=["'][^"']*(?:entry-content|post-content|postarea|single-content)[^"']*["'][\s\S]*?<\/div>/i)?.[0] || ''
  const allImages = html.match(/<img\b[^>]*>/gi) || []
  const pageImages = allImages.filter(img => /(?:blogspot|blogger|googleusercontent|bp\.blogspot|lh\d+\.googleusercontent)/i.test(img))

  return [
    '<!-- category -->',
    category,
    '<!-- title -->',
    title,
    '<!-- entry content candidate -->',
    entryContent,
    '<!-- first 30 candidate page images -->',
    ...pageImages.slice(0, 30)
  ].join('\n')
}

const home = stripNoise(read('clean-home.html'))
const page2 = stripNoise(read('clean-page-2.html'))
const search = stripNoise(read('clean-search-batman.html'))
const reader = stripNoise(read('clean-comic-reader.html'))

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

write('analysis-comic-reader-core.html', extractReaderCore(reader))
