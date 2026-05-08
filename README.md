# Tascabile

Repository modulare di estensioni Paperback/Tascabile per manga e comics, ricostruita da zero con una struttura documentata, testabile e mantenibile.

## Obiettivo

Questa repository nasce dalla ricostruzione ordinata del progetto `extensions-foreign`, mantenendo le funzionalità utili ma ripensando struttura, organizzazione, test e workflow.

L'obiettivo è mantenere source compatibili con Paperback `0.8`, isolate tra loro e semplici da validare prima di ogni bundle.

## Requisiti

- Node.js 20
- npm
- Paperback toolchain `0.8.x`

## Comandi principali

```bash
npm ci
npm run typecheck
npm test
npm run validate
npm run bundle -- --folder=0.8
npm run serve
```

## Struttura progetto

```text
src/
  index.ts
  MangaWorld/
    MangaWorld.ts
    includes/
      icon.png
  BatCave/
    BatCave.ts
    includes/
      icon.png

lib/
  core/
    url.ts
  sources/
    MangaWorld/
      constants.ts
      MangaWorldParser.ts
      MangaWorldParser.test.ts
    BatCave/
      constants.ts
      BatCaveParser.ts
      BatCaveParser.test.ts

fixtures/
  mangaworld/
    home.html
    search.html
    manga-detail.html
    chapter-list.html
  batcave/
    home.html
    search.html
    comic-detail.html
    chapter-reader-page-1.html
    chapter-reader-page-2.html

.github/workflows/
  validate.yml
  bundle-check.yml
```

## Convenzioni source

Ogni source deve avere:

- implementazione Paperback in `src/<Source>/<Source>.ts`;
- parser separato in `lib/sources/<Source>/<Source>Parser.ts`;
- costanti condivise in `lib/sources/<Source>/constants.ts`;
- fixture HTML in `fixtures/<source>/`;
- test minimi del parser;
- export esplicito in `src/index.ts`;
- versione source aggiornata a ogni modifica funzionale.

## Workflow

- `Validate`: esegue typecheck e test.
- `Bundle Check`: esegue validate, genera il bundle `0.8`, verifica `versioning.json` e controlla che le source pubblicate siano esattamente quelle attese.

## Stato migrazione

| Source | Stato | Note |
|---|---|---|
| MangaWorld | Attiva | Source italiana, parser e test presenti |
| BatCave | Attiva | Source comics inglese, parser e test presenti |
| MangaDex IT | Da migrare | Prossima fase |
| MangaDex | Da migrare | Da analizzare dopo MangaDex IT |
| Altre source | Da analizzare dopo | Nessuna source aggiunta senza analisi dedicata |

## Roadmap

1. Stabilizzare MangaWorld.
2. Migliorare test, bundle check e documentazione.
3. Migrare BatCave.
4. Migrare MangaDex IT.
5. Migrare MangaDex.
6. Valutare nuove source solo dopo validazione tecnica.
