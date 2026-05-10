# Tascabile

Repository di estensioni Paperback 0.9 mantenuta da **DarkDragonkz**.

Questa repository è impostata come base TypeScript per Paperback 0.9, usando `@paperback/toolchain`, `@paperback/types`, `cheerio`, `oxlint`, `oxfmt`, `husky` e GitHub Actions.

## Stato attuale

La source **MangaWorld** è stata aggiunta usando come riferimento tecnico i file reali dello ZIP `mangaworld-extensions-0.9-stable`.

Dati source:

| Campo | Valore |
|---|---|
| Nome | MangaWorld |
| URL base | `https://www.mangaworld.mx` |
| Lingua | Italiano |
| Rating | Adult |
| Tipologia | Manga, manhwa, manhua, novel |
| Login | No |
| Tracker | No |

Nota: il codice di riferimento ricava i dati dal JSON `$MC` incorporato nelle pagine HTML MangaWorld. Non è stata verificata una API JSON pubblica separata. Il sito live non è risultato recuperabile dagli strumenti web disponibili durante questa modifica, quindi Cloudflare/protezioni anti-bot e referer immagini devono essere verificati da ambiente locale/Paperback.

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

## Struttura

```text
.github/workflows/build.yml
.vscode/extensions.json
.vscode/settings.json
.husky/pre-push
src/MangaWorld/main.ts
src/MangaWorld/pbconfig.ts
src/generic/config.ts
src/generic/forms.ts
src/generic/main.ts
src/generic/models.ts
src/generic/network.ts
src/generic/parsers.ts
src/generic/utils.ts
src/common/errors.ts
src/common/http.ts
src/common/html.ts
src/common/dates.ts
src/common/urls.ts
src/common/images.ts
README.md
package.json
tsconfig.json
.oxlintrc.json
.oxfmtrc.json
.gitignore
LICENSE
```

## Pattern source Paperback 0.9

Dalle repository di riferimento analizzate, una source reale Paperback 0.9 usa questo schema:

```text
src/<NomeSource>/main.ts
src/<NomeSource>/pbconfig.ts
src/<NomeSource>/static/icon.png
```

File aggiuntivi come `network.ts`, `parsers.ts`, `models.ts`, `forms.ts`, `settings.ts`, `interceptors.ts` o cartelle `implementations/` vengono creati solo quando servono alla source.

## Pubblicazione GitHub Pages

Il workflow `Build and Deploy` esegue:

1. installazione dipendenze;
2. controllo TypeScript;
3. controllo lint;
4. controllo format;
5. bundle con `paperback-cli bundle`;
6. deploy della cartella `bundles` su branch `gh-pages`.

Dopo il primo deploy, in GitHub abilita Pages da:

```text
Settings > Pages > Deploy from a branch > gh-pages > /(root)
```

URL previsto della repository Paperback:

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
