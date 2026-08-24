# Tascabile

Repository di estensioni **Paperback 0.9 dedicate esclusivamente a fonti italiane**, mantenuta da **DarkDragonkz**.

## Fonti

Le estensioni attive sono:

- MangaWorld
- GTOTheGreatSite
- HastaTeam
- HastaTeamDDT
- LupiTeam
- PhoenixScans
- TuttoAnimeManga

NineManga rimane nel codice come sorgente italiana storica, ma la sua `pbconfig` è disabilitata finché il sito resta indisponibile/instabile e quindi non viene pubblicata nel bundle.

Le precedenti sorgenti internazionali/inglesi e la sincronizzazione EverythingMoe sono state rimosse: Tascabile non scarica più sorgenti esterne durante la build.

## MangaWorld

URL base: `https://www.mangaworld.mx`

MangaWorld usa il JSON `$MC` quando disponibile e fallback HTML per resistere ai cambiamenti del sito. Il reader apre la pagina reale `/manga/<id>/<slug>/read/<chapterId>`, normalizza gli URL del CDN `cdn.mangaworld.mx` e scarta URL vuoti/non validi prima di restituirli a Paperback.

Il sito classico segnala che Doujinshi e contenuti +18 sono stati trasferiti su MangaWorldAdult; Tascabile mantiene MangaWorld classico come fonte italiana generalista.

## Requisiti

- Node.js 24
- npm
- Paperback 0.9

## Verifica

```bash
npm install
npm run tsc
npm run lint:check
npm run format:check
npm run bundle
```

Il workflow `Build and Deploy` esegue gli stessi controlli e pubblica `bundles` su `gh-pages` soltanto dopo il completamento dei check.

Repository Paperback:

```text
https://darkdragonkz.github.io/Tascabile
```

## Crediti

MangaWorld deriva dal lavoro GPL-3.0-or-later di Inkdex, con modifiche mantenute in Tascabile. Le fonti fansub italiane ripristinate derivano da Sinon-Paperback-Extensions/Catta1997, distribuito con licenza MIT.
