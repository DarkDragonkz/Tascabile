# Architettura Tascabile

Tascabile è una repository di estensioni Paperback/Tascabile basata su Paperback 0.8.

L'obiettivo è ricostruire il vecchio progetto `extensions-foreign` con una struttura più chiara, modulare e testabile.

## Principi

- Migrare una source alla volta.
- Non copiare codice senza capirne il funzionamento.
- Separare il più possibile logica HTTP, parsing e configurazione.
- Mantenere compatibilità con Paperback 0.8.
- Aggiungere test minimi per ogni modulo condiviso e, quando possibile, per ogni parser.
- Evitare duplicazioni tra source simili.

## Struttura prevista

```text
src/
  index.ts
  sources/
    MangaDex/
      MangaDexBase.ts
      MangaDexParser.ts
      MangaDexIT.ts
      MangaDex.ts
      types.ts
      index.ts

lib/
  core/
    http.ts
    url.ts
```

## Entry point

Il file principale della repository è:

```text
src/index.ts
```

Qui vengono esportate le source che Paperback deve caricare.

Esempio finale atteso:

```ts
export const MangaDexITSource = new MangaDexIT()
export const MangaDexSource = new MangaDex()
```

## Core condiviso

La cartella `lib/core` contiene utility condivise che non devono essere trattate come source Paperback.

### `url.ts`

Gestisce:

- costruzione URL;
- query string;
- join sicuro di parti URL;
- query param multipli.

### `http.ts`

Gestisce:

- header comuni;
- header JSON;
- struttura base delle request.

Le request vere restano gestite dal `requestManager` di Paperback.

## Nota importante su Paperback 0.8

La toolchain Paperback interpreta le cartelle dentro `src` come potenziali source. Per questo i moduli condivisi generici non vanno messi in `src/core`, ma in `lib/core`.

## Sources

Ogni source deve essere organizzata in una cartella dedicata.

Esempio:

```text
src/sources/MangaDex/
  MangaDexBase.ts
  MangaDexParser.ts
  MangaDexIT.ts
  MangaDex.ts
  types.ts
  index.ts
  includes/
    icon.png
```

## Ordine di migrazione

1. MangaDex IT
2. MangaDex
3. MangaWorld
4. ReadComicsOnline
5. ReadAllComics
6. Comix
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
7. XoxoComic
8. WeebCentral
9. NineManga IT
10. MangaPark
11. MangaPark IT
12. MangaBall
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
8. XoxoComic
9. WeebCentral
10. NineManga IT
11. MangaPark
12. MangaPark IT
13. MangaBall
>>>>>>> theirs

## Regola di migrazione

Una source viene aggiunta a `src/index.ts` solo quando:

- compila con `npm run typecheck`;
- i test esistenti passano;
- il parser principale è stato almeno verificato manualmente;
- il bundle Paperback viene generato correttamente.
