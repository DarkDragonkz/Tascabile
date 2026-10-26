# Tascabile

[![Build and Deploy](https://github.com/DarkDragonkz/Tascabile/actions/workflows/build.yml/badge.svg)](https://github.com/DarkDragonkz/Tascabile/actions/workflows/build.yml)

Repository di estensioni per **Paperback 0.9** (iPhone e iPad) dedicata soprattutto a **manga e scanlation in italiano**, mantenuta da **DarkDragonkz**. Per i fumetti occidentali include due reader Comics in inglese, scelti dove non esistono alternative italiane affidabili.

## Installazione

1. In Paperback apri la gestione delle estensioni e scegli di aggiungere un repository.
2. Inserisci l'indirizzo:

   ```text
   https://darkdragonkz.github.io/Tascabile
   ```

3. Installa le fonti che ti interessano. Gli aggiornamenti compaiono in Paperback come per qualsiasi altro repository.

## Fonti

### Manga e scanlation in italiano

| Fonte | Contenuti | Punti di forza |
| --- | --- | --- |
| **MangaWorld** | manga, manhwa, manhua | In tendenza, ultimi capitoli, sezione "Per te" sui generi preferiti, ricerca avanzata con generi inclusi/esclusi, reader con tutte le pagine del capitolo |
| **Niadd** | manga | Stesso catalogo e reader della storica NineManga. Italiano predefinito; dalle impostazioni anche portoghese (BR), francese e russo |
| **GTO The Great Site** | scanlation | Universo GTO di Onizuka e altri progetti del team |
| **Hasta Team** | scanlation | Progetti recenti e ampio archivio storico |
| **Hasta Team DDT** | volumi completi | Archivio DDT con biblioteca alfabetica |
| **Lupi Team** | scanlation | Serie di punta (One Piece, Berserk, Hunter × Hunter) e archivio |
| **Phoenix Scans** | scanlation | Ultime uscite, serie aggiornate di recente, catalogo completo |
| **TuttoAnimeManga** | manga | Grande archivio con classici e ultime uscite |
| **Juin Jutsu Team** | scanlation | One Piece, Black Clover, Ichi the Witch e un catalogo di oltre cento serie |
| **Shinobi Scans** | manhwa, webtoon | Overgeared, The Return of the Disaster-Class Hero; ricerca per genere e stato |
| **AnimeShinigami** | manhwa | Nano Machine e altri manhwa d'azione; ricerca per genere e stato |

Le sei fonti fansub storiche (da GTO a TuttoAnimeManga) hanno **Home, impostazioni e filtri dedicati**, pensati sul catalogo di ogni team; condividono soltanto l'infrastruttura tecnica (rete, cache, parsing). Juin Jutsu legge l'API del suo reader FoOlSlide; Shinobi Scans e AnimeShinigami condividono un motore per il tema WordPress Madara, con i generi di ricerca presi dal sito stesso. Nelle Home le copertine usano le miniature leggere del sito, mentre la scheda del manga mostra la copertina originale.

### Comics in inglese

| Fonte | Note |
| --- | --- |
| **BatCave** | Home dedicata, ricerca avanzata, sessione Cloudflare persistente |
| **Read Comics Online** | Home e impostazioni dedicate, ricerca ordinabile |

I reader Comics vengono sincronizzati durante la build da [`Nicartjay/PaperbackExt`](https://github.com/Nicartjay/PaperbackExt), fissato alla revisione `a6ef7b8f4f96b37327ab27429fdea7f9e5d8a658` (15 ottobre 2026): la build è riproducibile e non cambia da sola quando l'upstream si aggiorna.

## Limiti noti

- **Cloudflare (BatCave, Read Comics Online, Niadd):** se il sito richiede una verifica, Paperback mostra il banner e la verifica va completata a mano. Le richieste vengono messe in pausa per non aprire più banner insieme, e i cookie ottenuti restano salvati per ridurre le verifiche ripetute. Non esistono bypass automatici.
- **Niadd in inglese, spagnolo e tedesco non è disponibile:** le versioni inglese e spagnola instradano i capitoli verso siti pubblicitari esterni; quella tedesca ha le immagini non più raggiungibili sul sito stesso.
- **NineManga** e **ReadComicOnline** sono disabilitate: i siti sono offline o instabili. Il codice di NineManga resta nel repository come riferimento storico.
- La velocità delle immagini dipende anche dai server delle singole fonti: le estensioni evitano redirect e richieste inutili ma non riducono la qualità delle tavole.

## Sviluppo

Requisiti: **Node.js 24** e npm.

```bash
npm install          # dipendenze (installa anche l'hook di pre-push)
npm run test         # pipeline completa: test offline, sync Comics, TypeScript, lint, formato, bundle
npm run dev          # server locale con ricaricamento, da aggiungere in Paperback per le prove
```

Comandi singoli:

| Comando | Cosa fa |
| --- | --- |
| `npm run test:core` | test offline su fixture reali (`tests/`, `fixtures/`) |
| `npm run sync:comics` | scarica e adatta i reader Comics dall'upstream fissato |
| `npm run tsc` | controllo dei tipi |
| `npm run lint:check` / `npm run lint` | lint (il secondo corregge automaticamente) |
| `npm run format:check` / `npm run format` | formattazione (il secondo riscrive i file) |
| `npm run bundle` | genera i bundle in `bundles/` |

Il workflow [`Build and Deploy`](.github/workflows/build.yml) esegue gli stessi controlli su ogni push e pull request e, solo per `main`, pubblica `bundles/` su GitHub Pages. Le modifiche ai reader Comics vanno fatte negli script in `scripts/`, non nei file generati. Contesto, decisioni e regole del progetto sono in [`AGENTS.md`](AGENTS.md).

### Struttura

```text
src/
├── MangaWorld/, generic/      # MangaWorld e il suo motore ($MC JSON con fallback HTML)
├── Niadd/                     # Niadd multilingua
├── FansubGeneric/             # infrastruttura comune alle sei fansub
├── GTOTheGreatSite/ … TuttoAnimeManga/   # Home, impostazioni e filtri di ogni fansub
├── JuinJutsu/                 # Juin Jutsu Team (API FoOlSlide)
├── MadaraGeneric/             # motore per i siti WordPress Madara
├── ShinobiScans/, AnimeShinigami/   # configurazione dei due siti Madara
├── common/                    # helper condivisi (cache, caroselli della Home)
└── NineManga/                 # sorgente storica, disabilitata
scripts/                       # sync e personalizzazione dei reader Comics
tests/, fixtures/              # test offline e pagine reali catturate
```

## Crediti e licenze

Il repository è distribuito con licenza MIT (vedi [`LICENSE`](LICENSE)), salvo dove indicato diversamente:

- **MangaWorld** deriva dal lavoro GPL-3.0-or-later di Inkdex; i file interessati riportano l'intestazione SPDX.
- Le **fonti fansub** derivano da Sinon-Paperback-Extensions / Catta1997 (MIT).
- I **reader Comics** derivano da Nicartjay/PaperbackExt e dai relativi port Keiyoushi (MIT).

Dettagli in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
