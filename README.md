# Tascabile

Repository di estensioni Paperback/Tascabile per manga e comics, ricostruita da zero con una struttura modulare, documentata e mantenibile.

## Obiettivo

Questa repository nasce dalla ricostruzione ordinata del progetto `extensions-foreign`, mantenendo le funzionalità utili ma ripensando struttura, organizzazione, test e workflow.

## Strategia

La migrazione avverrà una source alla volta. Ogni source dovrà avere:

- struttura chiara;
- parser separato dalla logica HTTP;
- test minimi quando possibile;
- configurazione esplicita;
- compatibilità con Paperback 0.8.

## Stato migrazione

| Source | Stato |
|---|---|
| MangaWorld | In corso |
| MangaDex IT | Da migrare |
| MangaDex | Da migrare |
| Altre source | Da analizzare dopo |