# Tascabile

Repository di estensioni Paperback 0.9 mantenuta da **DarkDragonkz**.

Questa repository usa `@paperback/toolchain`, `@paperback/types`, TypeScript, `cheerio`, `oxlint`, `oxfmt`, `husky` e GitHub Actions.

## MangaWorld

La source **MangaWorld** usa `https://www.mangaworld.mx` ed è ottimizzata per le API native di Paperback 0.9.

| Campo | Valore |
|---|---|
| Nome | MangaWorld |
| URL base | `https://www.mangaworld.mx` |
| Lingua | Italiano |
| Rating source | Everyone, con rating per singolo titolo/genere |
| Tipologia | Manga, manhwa, manhua, novel |
| Login | No |
| Tracker | No |

Funzionalità principali:

- ricerca avanzata nativa Paperback 0.9 con generi inclusi/esclusi, tipologia, stato e anno;
- Home con contenuti in tendenza, aggiornamenti, manga del mese, nuove aggiunte, più letti e sezione personalizzata **Per te**;
- preferenze per generi preferiti, generi/tipologie nascosti e tipologia predefinita;
- cache breve e deduplicazione delle richieste simultanee per ridurre il traffico verso MangaWorld;
- parser `$MC` come percorso principale, con fallback HTML per ricerca, dettagli, capitoli e reader;
- gestione del CDN `cdn.mangaworld.mx` con compatibilità per il vecchio dominio `.in`;
- filtro predefinito dei contenuti +18/Doujinshi trasferiti da MangaWorld al sito dedicato MangaWorldAdult;
- strumenti di manutenzione per test connessione, aggiornamento filtri e pulizia cache.

Non viene assunta l'esistenza di una API JSON pubblica separata: la source usa i dati `$MC` incorporati nelle pagine e, quando necessario, il markup HTML visibile.

## Requisiti

- Node.js 24
- npm
- Paperback 0.9

## Installazione

```bash
npm install
```

## Comandi disponibili

```bash
npm run tsc
npm run lint
npm run lint:check
npm run format
npm run format:check
npm run bundle
npm run test
npm run serve
npm run dev
npm run logcat
```

## Struttura MangaWorld

```text
src/MangaWorld/main.ts
src/MangaWorld/pbconfig.ts
src/MangaWorld/static/icon.png
src/generic/config.ts
src/generic/forms.ts
src/generic/htmlFallbacks.ts
src/generic/main.ts
src/generic/models.ts
src/generic/network.ts
src/generic/parsers.ts
src/generic/preferences.ts
src/generic/search.ts
src/generic/utils.ts
```

## Pattern source Paperback 0.9

Una source Paperback 0.9 usa normalmente questo schema:

```text
src/<NomeSource>/main.ts
src/<NomeSource>/pbconfig.ts
src/<NomeSource>/static/icon.png
```

File aggiuntivi come `network.ts`, `parsers.ts`, `models.ts`, `forms.ts`, `settings.ts`, `interceptors.ts` o cartelle `implementations/` vengono aggiunti quando servono alla source.

## Pubblicazione GitHub Pages

Il workflow `Build and Deploy` esegue:

1. installazione dipendenze;
2. sincronizzazione delle source esterne configurate;
3. controllo TypeScript;
4. controllo lint;
5. controllo format;
6. bundle con `paperback-cli bundle`;
7. deploy della cartella `bundles` sul branch `gh-pages`.

Repository Paperback pubblicata:

```text
https://darkdragonkz.github.io/Tascabile
```

## Verifica locale

```bash
npm install
npm run tsc
npm run lint:check
npm run format:check
npm run bundle
npm run test
npm run serve
```

## Dati necessari per nuove source

Per ogni nuova source servono:

1. nome source;
2. URL base;
3. lingua;
4. indicazione adult/NSFW;
5. tipo contenuto;
6. URL home;
7. URL ricerca;
8. URL esempio opera;
9. URL esempio capitolo;
10. eventuale login;
11. eventuale referer immagini;
12. eventuali API JSON;
13. eventuali protezioni Cloudflare o anti-bot;
14. eventuali filtri;
15. funzionalità richieste: sola lettura, tracker o extra.
