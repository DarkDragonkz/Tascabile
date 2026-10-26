# Tascabile — contesto di progetto e istruzioni per gli assistenti AI

> **Leggere questo file prima di analizzare o modificare il progetto.**
> Ultima ricognizione: **25 ottobre 2026**. Stato remoto verificato su `main` al commit
> [`98d6074bab572ccb0fed1f710f2169498280e0cd`](https://github.com/DarkDragonkz/Tascabile/commit/98d6074bab572ccb0fed1f710f2169498280e0cd),
> poi aggiornato lo stesso giorno con il ripristino della CI (vedi §3, punto 7).
> Questo documento descrive il contesto storico e lo stato osservato a quella data:
> **il codice e lo stato Git attuali restano la fonte di verità**. Se sono cambiati, aggiornare anche questo file.

## 1. Identità e obiettivo

- **Nome:** Tascabile.
- **Repository canonico:** <https://github.com/DarkDragonkz/Tascabile>.
- **Autore/manutentore:** `DarkDragonkz`.
- **Destinazione:** app di lettura **Paperback 0.9** su iPhone/iPad.
- **Linguaggio:** TypeScript, API `@paperback/types`, toolchain `@paperback/toolchain`.
- **Distribuzione:** GitHub Actions → bundle delle estensioni → branch `gh-pages`.
- **URL per aggiungere il repository in Paperback:** <https://darkdragonkz.github.io/Tascabile>.

### Visione del proprietario

Costruire una raccolta di estensioni **affidabili, veloci, aggiornabili e facili da manutenere**, con priorità a **manga e scanlation in italiano**. Sono ammesse due eccezioni deliberate per i **comics occidentali in inglese** quando le alternative italiane non sono sufficientemente affidabili. Non trasformare il progetto in un aggregatore indiscriminato di fonti straniere senza una decisione del proprietario.

L'esperienza d'uso viene valutata **principalmente su Paperback mobile**: home/esplorazione, ricerca, filtri, dettagli, capitoli, immagini e reader devono funzionare nell'app. Un parser che compila, o una pagina che funziona su PC, non è automaticamente una sorgente funzionante su iPhone.

**Fuori ambito:** non è un fork dell'app Paperback; il repository sviluppa le *estensioni*, non il client iOS, la sua barra di navigazione o il gestore download.

## 2. Stato effettivo su `main` — verificato il 25/10/2026

| Sorgente | Categoria | Stato e posizione |
| --- | --- | --- |
| **MangaWorld** | manga/manhwa/manhua IT | Inclusa nel bundle; `src/MangaWorld/`; Home e UI proprie; versione `1.0.0-alpha.41`. |
| **GTOTheGreatSite** | fansub IT | Inclusa; `src/GTOTheGreatSite/`; UI dedicata. |
| **HastaTeam** | fansub IT | Inclusa; `src/HastaTeam/`; UI dedicata. |
| **HastaTeamDDT** | fansub IT | Inclusa; `src/HastaTeamDDT/`; UI dedicata. |
| **LupiTeam** | fansub IT | Inclusa; `src/LupiTeam/`; UI dedicata. |
| **PhoenixScans** | fansub IT | Inclusa; `src/PhoenixScans/`; UI dedicata. |
| **TuttoAnimeManga** | fansub IT | Inclusa; `src/TuttoAnimeManga/`; UI dedicata. |
| **Batcave** | comics EN | Attiva, generata durante la build da upstream bloccato a una revisione specifica. |
| **Read Comics Online** (`ReadComicsOnline`) | comics EN | Attiva, generata durante la build. **Non confonderla con `ReadComicOnline`.** |
| **Niadd** | manga IT (+ BR/FR/RU) | Inclusa dal 25/10/2026; `src/Niadd/`; stesso backend di NineManga; versione `1.1.2`. Lingua del catalogo nelle impostazioni (stato `niadd.language`, predefinito `it`). ID manga: italiano senza prefisso (compatibile con 1.0.x), altre lingue `br:`/`fr:`/`ru:` così le voci di libreria restano nella loro lingua. Parser indipendente dalle etichette (attributi schema.org). Test offline in `tests/niadd.test.mjs` con fixture `fixtures/niadd/` (+ `br/`, `fr/`, `ru/`). Liste non paginabili (60 titoli); URL immagine firmati e a scadenza. |
| **JuinJutsu** (Juin Jutsu Team) | fansub IT | Inclusa dal 26/10/2026; `src/JuinJutsu/`; API JSON FoOlSlide (`/api/reader/…`): catalogo a pagine da 30, ultimi capitoli, serie con capitoli, pagine per ID capitolo. Nessuna API di ricerca: filtro locale sul catalogo (~115 serie). Sottocapitoli FoOlSlide `26/1` → `26.1`. Le immagini rifiutano Referer esterni (403). Versione `1.0.1`; test `tests/juinjutsu.test.mjs`, fixture `fixtures/juinjutsu/`. |
| **ShinobiScans** | fansub IT | Inclusa dal 26/10/2026; `src/ShinobiScans/` (solo configurazione) su `src/MadaraGeneric/`; versione `1.0.1`. Test condivisi `tests/madara.test.mjs`, fixture `fixtures/shinobiscans/`. |
| **AnimeShinigami** | fansub IT | Inclusa dal 26/10/2026; `src/AnimeShinigami/` (solo configurazione) su `src/MadaraGeneric/`; versione `1.0.1`. Fixture `fixtures/animeshinigami/`. |
| **NineManga** | legacy IT/EN | **Disabilitata:** codice storico in `src/NineManga/`, ma configurazione `pbconfig.ts.disabled`; non pubblicarla finché il sito è indisponibile/instabile. |
| **ReadComicOnline** (senza *s*) | comics EN | **Disabilitata:** sito segnalato offline; esclusa da sync, compilazione e bundle. |

Risultato: **13 fonti attive previste**, di cui 11 italiane e 2 Comics inglesi. Il numero indica la configurazione del repository, **non** una verifica in tempo reale della disponibilità di tutti i siti.

Le sei fonti fansub condividono la versione base `1.2.7` su `main`, definita in `src/FansubGeneric/basePbConfig.ts`. La versione root del progetto in `package.json` è `1.1.0-alpha.1`: **non confonderla con la versione di ogni singola estensione**.

## 3. Lavori già completati e decisioni consolidate

Questa è una cronologia sintetica, non un invito a ripetere modifiche già applicate.

1. **Maggio 2026 — fondazione e primi parser.** Impostata la raccolta Paperback 0.9 in TypeScript; incorporato MangaWorld a partire da codice upstream, con parsing JSON `$MC`, ricerca, filtri, dettagli, capitoli, pagine e fallback HTML. Il codice è organizzato in moduli. La sperimentazione su NineManga IT/EN ha evidenziato problemi soprattutto per il reader e per l'accesso alla parte inglese.
2. **Maggio–giugno — NineManga.** Si sono studiate varianti linguistiche, redirect, server intermedi, cookie/Cloudflare e reader mobile. L'italiano ha funzionato in alcune fasi, ma ciò **non** ne certifica il funzionamento attuale. Evitare URL di capitolo sintetici/non osservati, fan-out di richieste aggressivi e presunte correzioni non provate. Un caso storico di regressione è *Painter of the Night*, capitolo 1. Dal 12 agosto 2026 NineManga è intenzionalmente disabilitata perché il sito è inaffidabile.
3. **Agosto — focus italiano e MangaWorld.** Stabilizzate le 7 sorgenti italiane. MangaWorld usa il payload del manga per recuperare **tutte le immagini del capitolo**, con `/read/<chapterId>` come fallback. Il difetto storico era il reader bloccato a `Loading 0%` e URL non validi in **In tendenza**; mantenere casi di prova per entrambi.
4. **25 agosto — UI e Comics.** Le sei fonti fansub hanno ricevuto **UI/filtri specifici**, pur condividendo solo l'infrastruttura tecnica. Creati gli script di sincronizzazione e adattamento dei Comics; resi più robusti ID Unicode, immagini HTTPS/iOS ATS, header, redirect, sessioni e gestione iniziale delle challenge Cloudflare. `ReadComicOnline` è stata disabilitata; Batcave e `ReadComicsOnline` restano attive.
5. **9 settembre — PR [#26](https://github.com/DarkDragonkz/Tascabile/pull/26) unita in `main`.** Migliorate Home e impostazioni di MangaWorld (`1.0.0-alpha.34`). Ordine principale: **In tendenza**, **Ultimi capitoli**, **Per te** se configurato, **Nuove aggiunte**, **Più letti del mese** se abilitato. Filtri Tipologia/Genere più ordinati, contenuti nascosti in impostazioni dedicate, preferenze pregresse mantenute. Build e pubblicazione riportate riuscite; verifica estetica/UX su iPhone resta distinta dai test di codice.
6. **9–11 settembre — PR [#27](https://github.com/DarkDragonkz/Tascabile/pull/27), unita in `main` il 25 ottobre** dopo merge con il `main` corrente e test completi (13/13 `test:core`, TS, lint, formato, bundle). Testo storico: Propone `RequestCache<T>` condivisa con deduplicazione, TTL, invalidazione sicura e limite 64 voci; correzioni filtri generi/anni, snapshot di stato invalidi, capitoli sciolti + volumi e diagnostica connessione. Introduce **13 test offline** (`tests/core.test.mjs`, comando `npm run test:core`) e incrementa MangaWorld ad `1.0.0-alpha.35` e fansub a `1.2.1`. **Queste modifiche NON sono su `main` finché la PR non viene unita.** La descrizione della PR riporta test e CI superati al commit `621ae2657a2588d5adf99f1c89fed2caa440868a`; non sostituiscono lo smoke test sul dispositivo.

7. **25 ottobre — ripristino CI.** Un merge da un clone di maggio (`af58094`) aveva portato su `main` un `package-lock.json` obsoleto (rolldown 1.0.0, toolchain `alpha.87`, TS 6) e due workflow temporanei che si auto-committavano su `main` (`521dadc`). Con rolldown 1.0.0 il bundle falliva su `import { ExtensionInfo }` (export solo-tipo) nei `pbconfig.ts` Comics generati. Correzioni: lockfile rigenerato (toolchain/types `alpha.92`, TS 7.0.2, rolldown 1.2.15), patch nel sync che rende l'import `type ExtensionInfo`, workflow temporanei rimossi, `.gitignore` esteso a Comics generati e `_reference_repos/`. Versioni delle estensioni invariate: nessun cambiamento funzionale.

8. **25 ottobre — Home e dipendenze.** `@paperback/types`/`toolchain` `alpha.92` sono l'ultima release (il tag npm `latest` punta a una vecchia `alpha.64`: ignorarlo); aggiornato solo `oxfmt` a 0.74. I caroselli in evidenza usano i campi `summary` e `infoItems` (badge SF Symbols, max 2) tramite `src/common/discover.ts`: fansub (data ultimo capitolo + autore), MangaWorld *In tendenza* (trama + tipologia/stato), Niadd *Più popolari* (trama + data/generi), BatCave *Top rated* (trama + editore/anno, via `finalize-comic-readers.mjs`). ReadComicsOnline non arricchito: la lista non espone quei dati e mancano fixture. Liste fansub con `thumbnail_small` (copertine leggere). Le icone SF Symbols vanno verificate su iPhone.
9. **25 ottobre — upstream Comics e schede.** Pin `Nicartjay/PaperbackExt` aggiornato a `a6ef7b8` (15/10/2026): unico cambio di codice per noi gli header `sec-fetch-*` di BatCave (ricerca rifiutata dal sito senza di essi); versioni upstream BatCave `1.4.12.1`, RCO `1.4.15.2` → Tascabile `1.4.12.6` / `1.4.15.6`. Schede: fansub con valutazione solo se presente (prima `NaN` per ~22% delle serie con `rating: null`) e righe Target/Capitoli/Visualizzazioni/Ultimo aggiornamento; MangaWorld con gruppo "Generi", righe Fansub/Tipologia/Anno (la chiave storica `subs` resta letta come fallback per le voci di libreria salvate); Niadd con stato in italiano e Anno. Versioni: fansub `1.2.4`, MangaWorld `alpha.37`, Niadd `1.0.2`.
10. **25 ottobre — Niadd inglese/spagnolo: esclusi.** `www`/`es.niadd.com` cifrano i link capitolo (`/go/rds/?data=…`, che cambia a ogni caricamento) verso domini pubblicitari a rotazione; `/go/jump/` porta sempre ad articoli pubblicitari; il reader interno mostra le immagini solo aggirando il controllo sul Referer, considerato un bypass anti-bot e quindi escluso. Confermato con catture HAR del proprietario (25/10, conservate solo in locale in `_reference_repos/niadd-har/`): il lettore viene servito **solo** a navigazioni con `Referer` di un gateway pubblicitario (`explorefunctionality.com`, `mechanismexplained.com`…), nessun cookie coinvolto, nessuna verifica Cloudflare; aprendo lo stesso URL direttamente (anche via `techsmartideas.com/go/nien/<cid>-`) il browser riceve l'articolo civetta. Non esiste un equivalente legittimo del `cf_clearance` di NineManga: **non riaprire** senza un cambiamento del sito. `br`, `fr`, `ru` funzionano con link interni come l'italiano e sono selezionabili. **`de` escluso**: tutte le immagini (anche capitoli 2024) passano da `wimg.movietop.cc` → `optest.niadd.com/rebuid_webp.php` → `wie.mangadogs.com`, dominio che non risolve più; il guasto è del sito, non del parser. Ricontrollare prima di riattivarlo.
11. **25 ottobre — revisione generale.** MangaWorld: *In tendenza*, *Più letti del mese* e *Ultimi capitoli* ora applicano generi/tipologie nascosti e la classificazione 18+ (prima ignorati: nel payload della Home i generi sono ID, risolti con `globalData.genres` in `MangaWorldGeneric.homeContentRating`; test `tests/mangaworld-home.test.mjs`); *Ultimi capitoli* non pagina più all'infinito; numeri capitolo/volume senza `NaN`. Fansub: niente "Vol. 0", nomi visualizzati leggibili (l'ID resta il nome della cartella, `config.id = file` nella toolchain) e descrizioni specifiche. Rimossi sei moduli morti di `src/common/`; formattazione estesa a tutto il repository (`.prettierignore`); testi uniformati ("18+", "…"); README riscritto; notice GPL per MangaWorld/`generic`; `.vscode` allineato a oxc e TypeScript 7. Versioni: fansub `1.2.5`, MangaWorld `alpha.38`.
12. **25 ottobre — icone e badge.** Icone rifatte a 256×256 dai loghi ufficiali dei siti (fansub dalle versioni originali, Niadd 1024 px, MangaWorld ripulita dagli angoli bianchi e da 1,1 MB a 47 KB); prima le fansub erano a 72 px e LupiTeam/TuttoAnimeManga avevano pixel corrotti. Read Comics Online usa il proprio logo "RCO" al posto dell'icona generica MMRCMS: il file sta in `scripts/icons/` e lo copia `finalize-comic-readers.mjs`. BatCave mantiene l'icona a libro, che è la favicon del sito. Badge unificati in `src/common/badges.ts`: prima il tipo (`Manga`, `Fansub`, `Comics`), poi la lingua (`IT 🇮🇹`, `EN 🇬🇧`), Niadd anche `Multilingua`; i Comics generati li ripetono letteralmente in `customize-comic-readers.mjs`. Versioni: fansub `1.2.6`, MangaWorld `alpha.39`, Niadd `1.1.1`, BatCave `1.4.12.7`, RCO `1.4.15.7`.
13. **26 ottobre — tre nuove fansub italiane.** Scelte dalla lista italiana di Keiyoushi (estensioni Mihon) dopo verifica live; escluse su richiesta del proprietario MangaDex e MangaWorldAdult, scartati AGC/NIF (inattivi o dubbi), Walpurgis (503 "Accesso Limitato") e i siti hentai. Nessun comics in italiano adatto: le piattaforme legali (Koomy, Zipaki) sono a pagamento con sole anteprime. **Juin Jutsu** su API FoOlSlide; **Shinobi Scans** e **AnimeShinigami** su un nuovo motore `src/MadaraGeneric/` (tema WordPress Madara): Home *Ultimi aggiornamenti* / *Più letti* / *Nuove serie* da `/manga/?m_orderby=latest|views|new-manga` (404 oltre l'ultima pagina = lista vuota), ricerca `?s=…&post_type=wp-manga` con `genre[]` (in AND con `op=1`) e `status[]`, generi letti dal form di ricerca del sito; capitoli via `POST /manga/<slug>/ajax/chapters/` con fallback a quelli nella pagina della serie; ID capitolo = percorso relativo (`volume-1/21`, `capitolo-316`); reader `…/?style=list`; copertina della scheda = originale WordPress senza suffisso `-WxH` (verificato che esista). Badge `Fansub · IT 🇮🇹`, icone 256 px dai loghi dei siti (AnimeShinigami su base bianca: il logo nero spariva in tema scuro). Smoke test live di Home, paginazione, ricerca, filtri, scheda, capitoli, pagine e immagini superato per tutte e tre; resta la prova su iPhone.
14. **27 ottobre — revisione MangaWorld.** *In tendenza* mostrava la stessa serie più volte (il payload elenca i capitoli più visti: nella fixture One Piece 28–32 occupava 5 posti su 10): ora una scheda per serie con etichetta "Capitoli 28–32" / "Capitolo 5 e altri 2" (`trendingChapters` in `src/MangaWorld/main.ts`). *Più letti del mese* mostra tipologia e letture del mese (`monthViews`). Il flag `vm18` di MangaWorld ora classifica come 18+ scheda, Home, archivio e ricerca. Scheda con Visualizzazioni (`totViews`) e "Su MangaWorld dal". *Ultimi capitoli* pagina 1 riusa la Home già in cache (prima la scaricava una seconda volta) e le pagine successive passano da `fetchText` (cache + errori HTTP). Rimossi 8 metodi morti da `src/generic/parsers.ts` e il ramo JSON duplicato di `getHeroSection` (usava i generi come oggetti, ma nella Home sono ID): resta solo il fallback HTML, il JSON lo legge l'override di MangaWorld. `findChapterData` tollera `volumes`/`singleChapters` assenti. Smoke test live: Home completa in 6 richieste senza duplicati. Test in `tests/mangaworld-home.test.mjs`. Versione `alpha.40`.
15. **27 ottobre — revisione di tutte le fonti sui siti live.** Smoke test di ogni fonte (Home, ricerca, scheda, capitoli, pagine, immagine) con `Application` simulato: tutte funzionanti; BatCave e Read Comics Online rispondono con la verifica Cloudflare (403 `cf-mitigated: challenge`), da completare nell'app. Fansub (`src/FansubGeneric/chapters.ts`, test `tests/fansub.test.mjs`): numero = `chapter` + `.subchapter` (prima il sottocapitolo era perso: 24/6 → 24, la raccolta "One shot" di Hasta tutta a 0; ~2% dei capitoli), titoli vuoti `""` non più mostrati, etichetta Home uniforme ("Capitolo 63 · Eeek!", "Volume 4" per i volumi DDT, titolo per gli extra); le API rispondono vuoto sotto le 3 lettere, quindi la ricerca corta filtra il catalogo in locale (titolo, titoli alternativi, autore). Niadd: titoli dei capitoli senza il nome della serie e il numero (`chapterDisplayTitle`, numeri ancora calcolati dal titolo completo), etichetta "Episodi 21" → "Capitolo 21" (BR "Capítulo", FR "Chapitre"). Coerenza della lista capitoli: Paperback mostra già il numero, quindi il titolo contiene solo il titolo vero anche per Juin Jutsu (`label` separata per la Home), Madara (`chapterDisplayTitle`) e MangaWorld ("Capitolo 356" senza titolo → vuoto). CI: `npm ci`, cache npm, permesso di scrittura solo al job di deploy, deploy del bundle verificato dal job Check (artifact) invece di ricostruirlo, nessun annullamento dei deploy in corso. Su Windows `npm ci` può fallire per il binario oxfmt bloccato dall'estensione VS Code: in locale usare `npm install`. Versioni: fansub `1.2.7`, Niadd `1.1.2`, MangaWorld `alpha.41`, Juin/Shinobi/Shinigami `1.0.1`.

**Attenzione ai nomi dei repository storici:** in alcune conversazioni compare `DarkDragonkz/Paperback_Project`. Per questo lavoro, il repository canonico da ispezionare e aggiornare è **`DarkDragonkz/Tascabile`**. Non fondere automaticamente stati, branch o modifiche di repository diversi.

## 4. Architettura e file da conoscere

```text
Tascabile/
├── .github/workflows/build.yml    # CI e deploy GitHub Pages
├── .vscode/                       # impostazioni dell'editor
├── fixtures/                      # HTML catturato per casi di prova offline
│   ├── mangaworld/                # home-2026-10.html usata dai test della Home
│   ├── niadd/                     # it (radice) + br/, fr/, ru/
│   ├── ninemanga/                 # storico
│   ├── batcave/
│   └── readallcomics/             # solo riferimento: nessuna fonte ReadAllComics nel progetto
├── scripts/
│   ├── sync-comic-readers.mjs      # recupera sorgenti Comics pinning upstream
│   ├── customize-comic-readers.mjs # applica personalizzazioni
│   ├── finalize-comic-readers.mjs  # finalizza le modifiche
│   ├── repair-generated-comics.mjs # ripara output generato
│   └── clean-ninemanga-fixtures.mjs # storico: ripulisce le fixture NineManga
├── tests/                         # test offline (node --test), eseguiti da `npm run test:core`
├── src/
│   ├── common/                    # requestCache (cache condivisa) e discover (badge/date/info delle schede)
│   ├── generic/                   # motore MangaWorld: rete, parser, ricerca, form, preferenze, fallback
│   ├── MangaWorld/                # entrypoint e configurazione MangaWorld
│   ├── Niadd/                     # Niadd multilingua (it/br/fr/ru)
│   ├── FansubGeneric/             # motore condiviso SOLO delle sei fonti fansub
│   ├── GTOTheGreatSite/
│   ├── HastaTeam/
│   ├── HastaTeamDDT/
│   ├── LupiTeam/
│   ├── PhoenixScans/
│   ├── TuttoAnimeManga/
│   ├── JuinJutsu/                 # Juin Jutsu Team (API FoOlSlide)
│   ├── MadaraGeneric/             # motore per siti WordPress Madara (parser + estensione parametrica)
│   ├── ShinobiScans/              # config Madara
│   ├── AnimeShinigami/            # config Madara
│   └── NineManga/                 # storico disabilitato (pbconfig.ts.disabled)
├── package.json
├── tsconfig.json                  # fonti principali; esclude Comics generati
├── tsconfig.comics.json           # Batcave, ReadComicsOnline e utilità generate
├── README.md
└── THIRD_PARTY_NOTICES.md
```

I percorsi **`src/Batcave/`**, **`src/ReadComicsOnline/`** e **`src/utils/mmrcms/`** vengono popolati da `npm run sync:comics` e non compaiono necessariamente nel checkout pulito. Il comando usa l'upstream **`Nicartjay/PaperbackExt` al commit `a6ef7b8f4f96b37327ab27429fdea7f9e5d8a658`**. Le modifiche persistenti ai reader devono essere introdotte negli script di sync/customizzazione/finalizzazione (o in una migrazione esplicita), **non soltanto nei file generati**, che possono essere sovrascritti al prossimo sync.

### Regole di progettazione

- Ogni sorgente pubblicata ha normalmente `src/<Nome>/main.ts`, `pbconfig.ts` e `static/icon.png`.
- `src/generic/` è il motore MangaWorld (upstream Inkdex), **non** un livello universale da imporre a tutte le sorgenti.
- `src/FansubGeneric/` contiene rete, rate limit, parser e modelli condivisi tra GTO, HastaTeam, HastaTeamDDT, LupiTeam, PhoenixScans e TuttoAnimeManga.
- Le sei fansub hanno **Home, impostazioni, sezioni, ricerca e filtri indipendenti**. Non cancellare questa differenziazione per semplificare il codice.
- Riutilizzare `src/common/` per funzioni realmente generiche; non fare migrazioni architetturali massive senza motivazione e test.
- Preservare ID sorgente, ID manga/capitolo, chiavi `Application.getState`, preferenze salvate, filtri inclusi/esclusi e comportamento dell'utente dopo gli aggiornamenti.
- Il parsing MangaWorld favorisce **JSON `$MC`** e fallback HTML; distinguere fallimenti HTTP, pagine di errore HTML e payload validi. Reader con elenco completo e ordinato di immagini; nessun URL immaginato.
- Verificare immagini con HTTPS, `Referer` e `User-Agent` appropriati; non degradare qualità/risoluzione né sostituire arbitrariamente URL CDN funzionanti.

## 5. Sei ZIP di riferimento forniti dal proprietario

Sono **materiale di studio**, non lo stato della repository e non codice da importare in blocco. Nel contesto di questa ricognizione gli ZIP contengono **43 sorgenti complete di `main.ts`**, oltre a moduli tecnici condivisi. Mappatura:

| ZIP / upstream | Sorgenti esemplificative | Utilità attuale |
| --- | --- | --- |
| `Catta1997-mangaworld-extensions.zip` / `Catta1997/mangaworld-extensions` | MangaWorld, MangaWorldAdult; `generic/` | Parser `$MC`, fallbacks, rete e configurazioni MangaWorld; codice di origine da rispettare. |
| `LucifersCircle-pirate.vodka-extensions.zip` / `LucifersCircle/pirate.vodka-extensions` | ReadComicOnline, VortexScans | Architettura modulare Comics; **ReadComicOnline non è attiva** in Tascabile. |
| `Catta1997-Sinon-Paperback-Extensions.zip` / `Catta1997/Sinon-Paperback-Extensions` | GTOTheGreatSite, HastaTeam, HastaTeamDDT, LupiTeam, PhoenixScans, TuttoAnimeManga, altre | Origine delle sei fonti fansub e di `FansubGeneric/`. |
| `nyzzik-extensions.zip` / `nyzzik/extensions` | AsuraScans | Esempi di form, interceptor, filtri, stato e URL builder. |
| `karrot0-KakarotExtension.zip` / `karrot0/KakarotExtension` | Batcave, ReadComicsOnline, ReadAllComics, Mangabuddy e altre | Riferimenti per Comics, reader, interceptor e tracking; **non sono l'upstream pinning attuale dei Comics generati**. |
| `Catta1997-general-extensions.zip` / `Catta1997/general-extensions` | MangaDex, MangaPlus, Webtoon, MangaKatana, WeebCentral e altre | Pattern di implementazione Paperback 0.9 e possibili fonti future, soggette a scelta e test. |

**Regola obbligatoria:** se gli ZIP sono estratti in `_reference_repos/`, la cartella rimane **locale**, non viene importata nel runtime né committata. Dal 25/10/2026 il `.gitignore` su `main` esclude `_reference_repos/` e le cartelle Comics generate; verificarlo comunque prima di collocarvi file. Non includere materiale upstream a caso in una PR. Controllare sempre licenze, attribuzioni e provenienza: MangaWorld ha intestazioni **GPL-3.0-or-later**; il repository principale è MIT e `THIRD_PARTY_NOTICES.md` documenta anche codice MIT proveniente da altri autori.

## 6. Ambiente, comandi e ciclo di pubblicazione

**Requisiti dichiarati dal progetto:** Node.js **24**, npm, TypeScript (la repository usa `^7.0.2`), `@paperback/toolchain` e `@paperback/types` (`^1.0.0-alpha.92` su `main`). Non aggiornare versioni alpha, API o toolchain per supposizione: verificare compatibilità e changelog prima di proporlo.

Dal terminale integrato di VS Code, nella radice del clone:

```bash
npm install
npm run sync:comics
npm run tsc
npm run lint:check
npm run format:check
npm run bundle
```

Scorciatoie disponibili: `npm run test` esegue test offline + sync + TypeScript + lint + formato + bundle; `format`/`format:check` coprono tutto il repository tranne quanto escluso da `.gitignore` e `.prettierignore` (fixture, NineManga, Markdown, lockfile); `npm run dev` serve le estensioni in watch mode; `npm run logcat` aiuta la diagnostica. Il sync Comics necessita di rete/API GitHub. `npm run test:core` (test offline, PR #27) è disponibile su `main` dal 25/10/2026 ed è eseguito anche in CI e da `npm run test`.

Il workflow `.github/workflows/build.yml` si attiva su `push` in `main`/`0.9/stable`, PR e lancio manuale. Il job **Check** installa con `npm ci`, sincronizza, controlla TS/lint/formattazione e genera bundle, caricandolo come artifact. Il job **Deploy**, assente sulle PR e unico con permesso di scrittura, pubblica proprio quel bundle nel branch `gh-pages`. Non considerare una PR, un commit pushato o una CI verde equivalenti a un aggiornamento installato su Paperback.

**Lockfile:** `package-lock.json` deve restare allineato a `package.json`; dopo aver cambiato dipendenze rigenerarlo e committarlo. Un lockfile obsoleto ha già rotto il bundle (§3, punto 7). Su Windows con `core.autocrlf=true`, `format:check` segnala falsi positivi per i fine riga CRLF: la CI su Linux (LF) è il riferimento.

**Importantissimo:** `npm run lint` usa `--fix` e `npm run format` riscrive file; per un controllo iniziale non mutante preferire `lint:check` e `format:check`. Non committare per errore output generati, file di test temporanei, cookie, sessioni, log sensibili, credenziali, HAR privati o ZIP di riferimento.

## 7. Problemi e rischi da tenere monitorati

| Tema | Stato certo e comportamento richiesto |
| --- | --- |
| **MangaWorld Home** | La PR #26 ha rivisto sezioni e filtri; fare smoke test su dispositivo per *In tendenza*, URL delle schede, ordine, preferenze e sottotitoli. |
| **MangaWorld reader** | È stata adottata l'estrazione completa da `$MC` con `/read/<id>` come fallback. Verificare numero/ordine delle pagine, caricamento non bloccato a 0%, immagini e cambio capitolo. |
| **Cache, filtri e capitoli misti** | Correzioni della PR #27 unite il 25/10/2026 con test offline; resta da confermare il comportamento su iPhone. |
| **Cloudflare su iOS** | Batcave e ReadComicsOnline gestiscono verifica preventiva e sessioni/cookie riutilizzabili. La challenge resta soggetta al sito e all'utente: niente promesse di bypass automatico, CAPTCHA o Turnstile. |
| **NineManga** | Codice storico fermo, sito segnalato non affidabile. Riattivare solo dopo prova reale della disponibilità e reader mobile completo; non alterare indiscriminatamente la parte italiana che aveva funzionato. |
| **ReadComicOnline** | Offline e disabilitata; non ripristinarla solo perché un ZIP la contiene. |
| **Siti e domini** | Endpoint, selettori, Cloudflare, cookie e CDN cambiano. Fixtures e build da sole non provano che il sito live funzioni oggi. |
| **Licenze upstream** | Conservare commenti SPDX, note, copyright e condizioni applicabili. Non confondere codice GPL con MIT. |
| **Generazione Comics** | Sync fissato a commit upstream: modifiche manuali ai file generati sono temporanee; mantenere l'adattamento negli script versionati. |

## 8. Come deve lavorare l'AI quando riceve una nuova richiesta

1. **Orientamento:** eseguire `git status`, leggere richiesta, `README.md`, `package.json`, questa guida e i file della fonte interessata; identificare branch e commit correnti. Prima di suggerire un fix già aperto, verificare se la PR #27 o altre modifiche sono state unite.
2. **Individuare lo scope:** fonte esatta, funzionalità (Home, search, details, chapters, reader, image, setting, CI), dominio/lingua, sintomo riproducibile, eventuale log/cattura. Distinguere `ReadComicOnline` da `ReadComicsOnline`.
3. **Analizzare i dati:** usare fixture, parser, log, HTTP status/redirect/payload e, quando consentito, l'endpoint **mobile** reale. Prima di correggere il reader capire da dove arriva l'elenco **completo** delle pagine e quale richiesta fallisce. Evitare richieste concorrenti incontrollate e URL/capitoli inventati.
4. **Pianificare una modifica minima:** preferire fix mirati e riuso di helper condivisi solo se non rompe altre fonti. Conservare UI indipendenti, preferenze, ID e convenzioni del progetto. Non far ripartire da zero un parser stabile.
5. **Aggiungere/aggiornare test:** fixture per input e output, casi limite (HTML errore al posto di JSON/immagini, cache invalidata, pagine duplicate, capitoli sciolti e dentro volumi, filtri corrotti, redirect e rete instabile). Se una verifica è solo simulata, dichiararlo.
6. **Controllare:** eseguire i comandi adatti dal punto 6 e verificare diff/`git status`. Fare test manuale **nell'app Paperback su iPhone** per le modifiche al comportamento del reader e alla UX; chiedere risultati all'utente se il dispositivo non è accessibile.
7. **Consegnare con precisione:** dire quali file sono cambiati, quali test sono passati, quali non sono stati eseguiti, eventuali rischi, come provare e come aggiornare l'estensione. Una CI verde non equivale alla prova mobile; un commit non equivale al deploy.
8. **Aggiornare questo file** quando cambiano fonti attive, decisioni, versioni, problemi o workflow, mantenendo data, branch e SHA. Non sovrascrivere la storia con conclusioni non verificate.

### Vincoli di sicurezza e collaborazione

- Non pubblicare, fare merge, cambiare versioni o introdurre nuove fonti senza che la richiesta copra l'operazione; per cambi ampi proporre prima un piano e una PR reviewable.
- Non eseguire bypass automatici di CAPTCHA/Turnstile o soluzioni che richiedano credenziali/sessioni estranee al normale uso; i test mobili devono rispettare i limiti della piattaforma e del sito.
- Non eliminare codice legacy o cambiare il perimetro linguistico senza conferma. Mantieni NineManga disabilitata e le due eccezioni Comics attive salvo esplicita decisione.
- Non toccare modifiche locali preesistenti o file esterni allo scope; non usare operazioni Git distruttive senza consenso.
- Se il codice remoto contraddice questa guida, **mostrare l'evidenza e correggere la guida**, non modificare il codice per farlo combaciare con un ricordo.

## 9. Roadmap suggerita (non equivale a lavoro approvato)

1. ~~Verificare e decidere sulla PR #27~~ — unita il 25/10/2026; resta la verifica su dispositivo (punto 2).
2. **Smoke test reale di tutte le 13 fonti attive**, prima MangaWorld (Home, tendenza, filtri, reader completo), poi sei fansub, poi due reader Comics con Cloudflare e immagini.
3. **Rafforzare il ciclo di regressione:** fixture aggiornate, test di parsing/cache e casi di rete, evidenza di test iPhone dove la CI non basta.
4. **Igiene repository:** verificare esclusione `_reference_repos/` e output generati da Git, documentare i file locali, valutare gestione delle dipendenze per build riproducibili senza interrompere il workflow attuale.
5. **Nuove sorgenti:** confrontare eventualmente i 43 esempi negli ZIP con l'esigenza reale; scegliere per qualità, lingua, disponibilità mobile, manutenzione e licenza. Non integrare tutte le fonti automaticamente.
6. **Rivalutare NineManga** soltanto se il sito torna disponibile e la verifica mobile di ricerca/dettagli/capitoli/reader è soddisfacente; per `ReadComicOnline` attendere ritorno del sito prima di ogni riattivazione.

## 10. Riferimenti per verificare questo contesto

- [Repository canonico](https://github.com/DarkDragonkz/Tascabile)
- [README su main](https://github.com/DarkDragonkz/Tascabile/blob/main/README.md)
- [Package e script](https://github.com/DarkDragonkz/Tascabile/blob/main/package.json)
- [Build e deploy](https://github.com/DarkDragonkz/Tascabile/blob/main/.github/workflows/build.yml)
- [Note licenze di terzi](https://github.com/DarkDragonkz/Tascabile/blob/main/THIRD_PARTY_NOTICES.md)
- [PR #26 — MangaWorld UX, unita](https://github.com/DarkDragonkz/Tascabile/pull/26)
- [PR #27 — cache/filtri/test, aperta alla data di ricognizione](https://github.com/DarkDragonkz/Tascabile/pull/27)
- [Commit `main` esaminato](https://github.com/DarkDragonkz/Tascabile/tree/98d6074bab572ccb0fed1f710f2169498280e0cd)

---

**Istruzione di avvio per un nuovo assistente:** «Leggi `AGENTS.md`, esamina lo stato Git e l'architettura effettiva di Tascabile, conferma cosa è su `main` e cosa è ancora in PR, poi affronta la richiesta rispettando i vincoli e testando il più possibile la funzionalità mobile».
