const fs = require('fs')
const path = require('path')

const fixtureDir = path.join(process.cwd(), 'fixtures', 'readallcomics')

const fixtureNames = [
  'home',
  'page-2',
  'search-batman',
  'comic-reader',
  'category-batman'
]

function extractBody(html) {
  const bodyMatch = html.match(/<body\b[\s\S]*?<\/body>/i)
  return bodyMatch ? bodyMatch[0] : html
}

function removeNoisyBlocks(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
}

function normalizeHtml(html) {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanFixture(name) {
  const inputPath = path.join(fixtureDir, `${name}.html`)
  const outputPath = path.join(fixtureDir, `clean-${name}.html`)

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing fixture: ${inputPath}`)
  }

  const sourceHtml = fs.readFileSync(inputPath, 'utf8')
  const bodyHtml = extractBody(sourceHtml)
  const cleanHtml = normalizeHtml(removeNoisyBlocks(bodyHtml))

  fs.writeFileSync(outputPath, `${cleanHtml}\n`, 'utf8')

  console.log(`Created ${path.relative(process.cwd(), outputPath)} (${cleanHtml.length} chars)`)
}

for (const fixtureName of fixtureNames) {
  cleanFixture(fixtureName)
}
