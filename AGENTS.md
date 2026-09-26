# AGENTS.md — Personal Finance Tracker

## Missione

Costruire una PWA local-first, responsive e privacy-first per finanze personali basata su import periodici di export bancari.

Prima di modificare codice leggere integralmente:

- `docs/PRODUCT_SPEC.md`
- `docs/IMPORT_NORMALIZATION.md`

## Regole non negoziabili

1. Nessun backend nell'MVP.
2. Nessun dato utente inviato a servizi remoti.
3. Nessuna API bancaria.
4. Nessuna telemetria.
5. Nessun dato finanziario reale nel repository.
6. Solo fixture sintetiche.
7. Import incrementali: MAI cancellare/sostituire il dataset.
8. Reimport/overlap non devono duplicare movimenti.
9. Override manuali sopravvivono ai reimport.
10. Transfer fra conti propri non sono income/expense.
11. Importi in integer cents.
12. Date `YYYY-MM-DD`, logica Europe/Rome.
13. Correctness prima di UI.
14. **Responsive non è una milestone opzionale: ogni feature deve funzionare mobile mentre viene sviluppata.**
15. Nessuna pagina può dipendere da hover.
16. Nessun horizontal overflow globale a 375px.

## Stack

- React
- TypeScript strict
- Vite
- Dexie
- SheetJS/xlsx
- Zod
- Recharts
- date-fns
- Vitest
- React Testing Library
- vite-plugin-pwa
- Playwright essenziale

## Struttura

```text
src/
  app/
  components/
  db/
  domain/
  import/
    core/
    ing/
    intesa/
  normalization/
  categorization/
  transfers/
  investments/
  dashboard/
  backup/
  pages/
  styles/
  test/
docs/
  PRODUCT_SPEC.md
  IMPORT_NORMALIZATION.md
```

## Import pipeline

```text
read
-> sha256
-> detect
-> parse
-> validate
-> normalize
-> external IDs
-> fingerprints
-> preview
-> reconcile/dedup
-> user confirms
-> atomic DB commit
-> transfer matching
-> category rules
-> snapshot/dashboard
```

Mai scrivere prima della conferma.

## Parser

```ts
interface BankParser {
  id: string;
  version: string;
  detect(workbook: ParsedWorkbook): DetectionResult;
  parse(workbook: ParsedWorkbook): ParsedImport;
}
```

Niente logica banca-specifica nella UI.

## Merge

Bank fields aggiornabili:
- status
- bookingDate
- valueDate
- rawDescription
- sourceOperation
- sourceCategory
- externalTransactionId
- rawSourcePayload

Campi utente da preservare:
- appCategoryId
- kind quando manuale
- userNote
- transferLinkId manuale

## Dedup order

1. external ID
2. exact fingerprint
3. pending-posted fuzzy reconciliation
4. insert

Mai usare solo data + importo come unique key.

## Transfer matching

Auto-match solo high confidence.

Stesso importo + data non basta.

## Responsive

Testare ogni route almeno a:

```text
375x812
768x1024
1366x768
```

Regole:
- dashboard cards reflow;
- table desktop -> cards mobile;
- charts responsive;
- sidebar -> mobile nav/drawer;
- filter toolbar -> mobile sheet;
- touch target >=44px;
- no hover-only actions;
- modal max-height + internal scroll;
- safe-area support iOS;
- typography leggibile senza zoom.

## Dashboard

Priorità:

1. Net worth
2. Cash
3. Investments
4. Income / expense / savings
5. Trend
6. Categories
7. Accounts
8. Review queue

No UI da trading.

## GitHub Pages

- HashRouter preferito.
- Vite `base` configurabile.
- GitHub Actions.
- build completamente statico.

## Security

- no raw financial logs;
- no exports reali commit;
- AES-GCM backup;
- PIN local lock non presentato come full DB encryption.

## Test gates

Prima di chiudere milestone:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Per milestone UI eseguire anche viewport E2E.

## Workflow

Una milestone alla volta.

Per ogni milestone:

1. piano breve;
2. implementazione;
3. test;
4. verifiche;
5. docs;
6. stop e report.

Non anticipare feature fuori milestone.

## Core acceptance

Prima della dashboard avanzata devono essere verdi:

- same file -> no duplicates;
- overlapping file -> no duplicates;
- pending -> posted -> same row;
- internal transfer -> zero income/expense;
- manual category survives;
- import rollback works.
