# Tascabile

Repository di estensioni **Paperback 0.9 principalmente dedicata a fonti italiane**, mantenuta da **DarkDragonkz**.

L'obiettivo resta dare priorità alle fonti italiane. Per i fumetti occidentali Tascabile include reader Comics in inglese selezionati e mantenuti separatamente quando non esistono equivalenti italiani sufficientemente affidabili.

## Manga e scanlation in italiano

- MangaWorld
- GTOTheGreatSite
- HastaTeam
- HastaTeamDDT
- LupiTeam
- PhoenixScans
- TuttoAnimeManga

NineManga rimane nel codice come sorgente italiana storica, ma la sua `pbconfig` è disabilitata finché il sito resta indisponibile/instabile.

Le sei fonti fansub hanno **UI dedicate e indipendenti**, progettate in base al catalogo e alle caratteristiche della singola fonte. Condividono soltanto infrastruttura tecnica di basso livello come rete, cache, parsing e normalizzazione URL. MangaWorld mantiene la propria UI nativa separata.

## Comics in inglese

- Batcave
- Read Comics Online

`ReadComicOnline` è disabilitata perché il relativo sito è offline. Non viene più sincronizzata, compilata o inclusa nei bundle pubblicati.

I reader Comics attivi vengono sincronizzati durante la build da `Nicartjay/PaperbackExt`, fissato alla revisione `cf43397bb1b90521629291599cee312fcf30f0f5` del 22 agosto 2026. In questo modo la build è riproducibile e non cambia automaticamente quando l'upstream viene aggiornato.

### Cloudflare

Batcave e Read Comics Online eseguono una verifica preventiva del dominio prima di caricare la Home. Se il sito richiede una challenge, Paperback la segnala subito invece di far partire più richieste concorrenti. I prompt Cloudflare vengono inoltre deduplicati e i cookie ottenuti dal bypass vengono riutilizzati e conservati localmente per ridurre le verifiche ripetute.

## Prestazioni immagini

Tascabile normalizza gli URL immagine su HTTPS, elimina URL duplicati/non validi, usa header `Referer`/`User-Agent` coerenti e mantiene cache brevi delle risposte API. MangaWorld usa direttamente gli URL finali del CDN e recupera l'intero elenco pagine del capitolo prima di aprire il reader.

La velocità finale delle immagini dipende comunque anche dal server/CDN della singola fonte: l'estensione evita ritardi e redirect evitabili, ma non riduce qualità o risoluzione delle tavole.

## MangaWorld

URL base: `https://www.mangaworld.mx`

MangaWorld usa il JSON `$MC` quando disponibile e fallback HTML per resistere ai cambiamenti del sito. Il reader recupera prima l'elenco completo delle pagine dal payload manga e usa la pagina `/read/<chapterId>` solo come fallback.

## Requisiti

- Node.js 24
- npm
- Paperback 0.9

## Verifica

```bash
npm install
npm run sync:comics
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

MangaWorld deriva dal lavoro GPL-3.0-or-later di Inkdex. Le fonti fansub italiane derivano da Sinon-Paperback-Extensions/Catta1997 (MIT). I reader Comics derivano da Nicartjay/PaperbackExt e dai relativi port Keiyoushi (MIT); vedere `THIRD_PARTY_NOTICES.md`.
