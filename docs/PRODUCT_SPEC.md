# Personal Finance Tracker — Product & Technical Specification

## 0. Obiettivo

Realizzare una web app personale **local-first, responsive e installabile come PWA** per aggregare e analizzare:

- conti correnti;
- conto deposito;
- spese e entrate;
- trasferimenti interni;
- investimenti / PAC ETF;
- passività (es. mutuo);
- patrimonio netto;
- andamento nel tempo.

L'app sarà pubblicata inizialmente su **GitHub Pages**, senza backend e senza collegamenti PSD2 diretti alle banche.

La fonte dati bancaria primaria è l'import periodico di file Excel/CSV esportati dagli istituti.

### Modalità d'uso attesa

L'utente carica file **settimanali o mensili**.

L'import deve:

1. riconoscere automaticamente la banca/formato;
2. mostrare una preview;
3. importare solo i nuovi movimenti;
4. ignorare i duplicati;
5. aggiornare movimenti già noti quando cambiano stato;
6. riconciliare i trasferimenti fra conti propri;
7. NON cancellare mai lo storico a seguito di un nuovo import;
8. aggiornare dashboard e grafici.

---

# 1. Requisiti non negoziabili

- Local-first.
- Single-user.
- Nessun backend nell'MVP.
- Nessun database cloud.
- Nessuna API bancaria.
- Nessuna credenziale bancaria memorizzata.
- Nessun dato finanziario inviato fuori dal dispositivo.
- Hosting statico GitHub Pages.
- Persistenza IndexedDB.
- Import Excel incrementale.
- Deduplica robusta.
- Backup cifrato.
- Offline/PWA.
- **Responsive da 320px fino a desktop large.**
- Desktop, tablet e mobile devono essere supportati dalla prima release.
- Nessun dato finanziario reale nel repository.

---

# 2. Stack raccomandato

- React
- TypeScript strict
- Vite
- Dexie.js / IndexedDB
- SheetJS (`xlsx`)
- Zod
- Recharts
- date-fns
- Vitest
- React Testing Library
- Playwright per pochi flussi E2E critici
- vite-plugin-pwa / Workbox

Evitare framework server-side nell'MVP.

---

# 3. Responsive design

## 3.1 Breakpoint funzionali

Usare CSS responsive fluido, con breakpoint indicativi:

```text
mobile:        320–639 px
tablet:        640–1023 px
desktop:       1024–1439 px
large desktop: >=1440 px
```

I breakpoint non devono generare quattro UI diverse: la stessa gerarchia informativa deve adattarsi.

## 3.2 Layout

### Desktop

- sidebar persistente;
- content max-width ragionevole;
- KPI in griglia 4 colonne;
- grafici 2 colonne;
- tabella movimenti completa.

### Tablet

- sidebar comprimibile/drawer;
- KPI 2 colonne;
- grafici 1 o 2 colonne in base allo spazio.

### Mobile

- header compatto;
- bottom navigation oppure drawer;
- KPI 1–2 colonne;
- grafici full width;
- niente horizontal scroll della pagina;
- tabelle complesse trasformate in cards/list view;
- filtri dentro bottom sheet/drawer;
- pulsanti touch min 44x44 px;
- import file utilizzabile da file picker mobile.

## 3.3 Dashboard responsive

Desktop:

```text
[KPI][KPI][KPI][KPI]
[ Grafico patrimonio ][ Cash flow ]
[ Spese categorie   ][ Asset mix ]
[ Conti / review queue            ]
```

Mobile:

```text
[KPI][KPI]
[KPI][KPI]
[Grafico patrimonio]
[Cash flow]
[Spese categorie]
[Asset mix]
[Conti]
[Da verificare]
```

## 3.4 Movimenti

Desktop:
- table.

Mobile:
- transaction card con:
  - data;
  - merchant/descrizione;
  - conto;
  - categoria;
  - importo;
  - badge pending;
  - tap -> dettaglio.

No tabella con 8 colonne compressa su smartphone.

## 3.5 Grafici

Tutti i grafici devono:

- usare `ResponsiveContainer` o equivalente;
- adattarsi alla larghezza;
- mantenere altezza minima mobile;
- tooltip touch-friendly;
- legenda collassabile;
- evitare label sovrapposte;
- usare abbreviazioni € / k dove necessario.

## 3.6 Accessibilità

- contrasto WCAG AA dove possibile;
- focus keyboard visibile;
- navigazione tastiera desktop;
- aria-label sui controlli icon-only;
- non usare colore come unica informazione;
- supporto `prefers-reduced-motion`.

---

# 4. Fonti bancarie analizzate

## 4.1 Intesa Sanpaolo

Workbook osservato:

```text
sheet: Lista Operazione
```

L'header non è la prima riga e NON deve essere hardcoded.

Header da cercare dinamicamente:

```text
Data
Operazione
Dettagli
Conto o carta
Contabilizzazione
Categoria
Valuta
Importo
```

Nel file analizzato l'header era alla riga 20, ma il parser deve ignorare tale dettaglio e cercarlo.

Sono presenti metadati nelle righe precedenti.

### Stati osservati

```text
CONTABILIZZATO
NON CONTABILIZZATO
```

Mapping:

```text
CONTABILIZZATO     -> posted
NON CONTABILIZZATO -> pending
```

### Mapping

```text
Data              -> bookingDate
Operazione        -> sourceOperation
Dettagli          -> rawDescription
Conto o carta     -> sourceAccountLabel
Contabilizzazione -> status
Categoria         -> sourceCategory
Valuta            -> currency
Importo           -> amount
```

### Note

- Le date sono Excel serial date.
- Importo negativo = uscita.
- Importo positivo = entrata.
- La categoria della banca è solo un suggerimento iniziale.
- Alcune disposizioni contengono identificativi tecnici nella descrizione.
- I pagamenti carta possono non avere un ID stabile.
- Un pending può trasformarsi in posted in un export successivo.

---

## 4.2 ING Conto Corrente Arancio

Workbook osservato:

```text
sheet: MovimentiContoCorrenteArancio
```

Header da cercare dinamicamente:

```text
DATA CONTABILE
DATA VALUTA
CAUSALE
DESCRIZIONE OPERAZIONE
IMPORTO IN EURO
```

Nel file analizzato l'header era alla riga 12.

Sono presenti metadati iniziali quali:

- intestazione;
- numero conto;
- IBAN;
- saldo iniziale;
- saldo finale;
- intervallo temporale.

### Mapping

```text
DATA CONTABILE         -> bookingDate
DATA VALUTA            -> valueDate
CAUSALE                -> sourceOperation
DESCRIZIONE OPERAZIONE -> rawDescription
IMPORTO IN EURO        -> amount

currency = EUR
status   = posted
```

### Metadati da estrarre

- conto/IBAN mascherato;
- saldo iniziale;
- saldo finale;
- periodo estratto.

Il saldo finale può aggiornare il saldo noto del conto ING.

---

# 5. Riconoscimento formato

```ts
type DetectedSource =
  | { bank: "INTESA"; confidence: number; sheetName: string }
  | { bank: "ING"; confidence: number; sheetName: string }
  | { bank: "UNKNOWN"; confidence: number };
```

## Intesa

Match forte se una riga contiene almeno:

```text
Data
Operazione
Dettagli
Contabilizzazione
Importo
```

## ING

Match forte se una riga contiene:

```text
DATA CONTABILE
DATA VALUTA
CAUSALE
DESCRIZIONE OPERAZIONE
IMPORTO IN EURO
```

Se confidence bassa:
- non scrivere nel DB;
- chiedere selezione manuale.

---

# 6. Modello dati

## Account

```ts
interface Account {
  id: string;
  institution: "ING" | "INTESA" | "TRADE_REPUBLIC" | "MANUAL";
  name: string;
  type: "checking" | "savings" | "broker" | "cash" | "other";
  currency: string;

  maskedIdentifier?: string;
  ownAccountAliases: string[];

  currentBalance?: number;
  currentBalanceAt?: string;
  balanceSource?: "import" | "manual" | "derived";

  active: boolean;

  createdAt: string;
  updatedAt: string;
}
```

Non memorizzare IBAN completo se non necessario.

## Transaction

Gli importi persistiti devono essere integer cents.

```ts
type TransactionStatus = "pending" | "posted" | "cancelled";

type TransactionKind =
  | "income"
  | "expense"
  | "internal_transfer"
  | "investment_transfer"
  | "fee"
  | "interest"
  | "other";

interface Transaction {
  id: string;
  accountId: string;

  bookingDate: string;
  valueDate?: string;

  amountCents: number;
  currency: string;

  status: TransactionStatus;
  kind: TransactionKind;

  merchant?: string;
  counterparty?: string;

  sourceOperation?: string;
  rawDescription: string;
  sourceCategory?: string;

  appCategoryId?: string;
  categorySource: "source" | "rule" | "manual" | "uncategorized";

  userNote?: string;

  externalTransactionId?: string;
  exactFingerprint: string;
  fuzzyFingerprint: string;

  transferLinkId?: string;

  sourceBank: "ING" | "INTESA" | "TRADE_REPUBLIC" | "MANUAL";

  firstSeenImportBatchId: string;
  lastSeenImportBatchId: string;

  manuallyEdited: boolean;

  rawSourcePayload: unknown;

  createdAt: string;
  updatedAt: string;
}
```

## ImportBatch

```ts
interface ImportBatch {
  id: string;

  sourceBank: "ING" | "INTESA" | "TRADE_REPUBLIC";

  fileName: string;
  fileSha256: string;

  parserVersion: string;
  normalizationVersion: string;

  sourcePeriodFrom?: string;
  sourcePeriodTo?: string;

  importedAt: string;

  rowsRead: number;
  insertedCount: number;
  updatedCount: number;
  duplicateCount: number;
  pendingReconciledCount: number;
  transferMatchedCount: number;
  warningCount: number;

  status: "preview" | "committed" | "rolled_back" | "failed";
}
```

## ImportBatchRow

```ts
interface ImportBatchRow {
  id: string;
  importBatchId: string;

  sourceRowIndex: number;
  sourceRowHash: string;

  transactionId?: string;

  action:
    | "inserted"
    | "matched"
    | "updated"
    | "pending_reconciled"
    | "ignored";

  previousTransactionSnapshot?: Transaction;
}
```

## TransferLink

```ts
interface TransferLink {
  id: string;
  outgoingTransactionId: string;
  incomingTransactionId: string;
  confidence: "high" | "medium" | "manual";
  createdBy: "automatic" | "user";
}
```

---

# 7. Normalizzazione

## Stringhe

`normalizeText`:

- trim;
- lowercase;
- whitespace multiplo -> singolo;
- normalizzare apostrofi;
- rimuovere token tecnici solo dal testo usato per matching;
- conservare sempre raw description.

## Date

Formato interno:

```text
YYYY-MM-DD
```

Logica:

```text
Europe/Rome
```

Evitare conversioni UTC che cambiano la data.

## Importi

```ts
amountCents = Math.round(amount * 100)
```

Mai confronti monetari persistenti con floating point.

---

# 8. Deduplica

REQUISITO CRITICO.

Un file nuovo può sovrapporsi temporalmente a file vecchi.

Esempio:

```text
import 1: 01/09 - 07/09
import 2: 01/09 - 14/09
import 3: 01/09 - 30/09
```

Il DB deve contenere una sola copia di ogni movimento.

## Priorità identificazione

1. external transaction ID;
2. exact fingerprint;
3. pending -> posted fuzzy match;
4. insert.

## External ID ING

Provare identificatori strutturati presenti nella descrizione, inclusi token CPU.

Regex indicative:

```regex
\bN\.\s*([A-Z0-9]+)\b
```

## External ID Intesa

Tentare codici disposizione.

Regex indicativa:

```regex
COD\.?\s*DISP\.?\s*([A-Z0-9]+)
```

Non assumere che tutte le operazioni abbiano ID.

## Exact fingerprint

```text
SHA256(
  sourceBank +
  accountId +
  bookingDate +
  valueDate +
  amountCents +
  currency +
  normalizedOperation +
  normalizedDescription
)
```

## Fuzzy fingerprint

Candidate finder:

```text
sourceBank
accountId
amountCents
currency
normalizedMerchantOrOperation
```

Non deve produrre merge autonomo se ambiguo.

---

# 9. Pending -> posted

Caso importante Intesa.

Match candidate se:

- stesso account;
- stesso importo;
- stessa valuta;
- merchant/operation compatibili;
- date entro +/-4 giorni.

High confidence:

- aggiornare la transazione esistente;
- status -> posted;
- aggiornare date e raw bank fields;
- preservare categoria/manual override/note/transfer;
- `pending_reconciled`.

Ambiguo:
- review queue;
- nessun merge automatico.

---

# 10. Import incrementale

REQUISITO NON NEGOZIABILE:

**Un nuovo file non sostituisce mai il database.**

Regole:

- mai DELETE ALL;
- mai replace dataset;
- file identico già committed -> bloccare;
- periodo sovrapposto -> consentire e deduplicare;
- nuovo movimento -> insert;
- movimento aggiornato -> update;
- movimento assente dal nuovo export -> NON cancellare;
- pending assente -> NON cancellare;
- pending con posted corrispondente -> reconcile.

---

# 11. Import UX

Route:

```text
/import
```

## Mobile e desktop

Supportare:
- drag & drop desktop;
- file picker desktop/mobile;
- multi-file import opzionale.

## Flow

### 1. Selezione

```text
[Importa file]
```

### 2. Analisi

Mostrare:

- banca;
- conto;
- periodo;
- righe;
- nuovi;
- duplicati;
- aggiornamenti;
- pending riconciliati;
- trasferimenti;
- errori.

### 3. Preview

Tabs/filters:

- Nuovi
- Aggiornati
- Duplicati
- Da verificare

Su mobile usare tabs scrollabili e cards.

### 4. Commit

Solo `Conferma importazione` scrive nel DB.

---

# 12. Rollback import

Route:

```text
/import/history
```

Ogni batch mostra:

- data;
- file;
- banca;
- periodo;
- nuovi;
- aggiornati;
- duplicati;
- warnings.

Supportare `Annulla importazione`.

Usare ImportBatchRow per ripristinare gli stati precedenti.

Non sovrascrivere silenziosamente modifiche manuali successive.

---

# 13. Trasferimenti interni

I trasferimenti fra conti propri:

- NON sono spese;
- NON sono entrate.

Esempi:

- Intesa -> ING
- ING corrente -> ING deposito

Match HIGH confidence:

- importo assoluto identico;
- segno opposto;
- stessa valuta;
- data +/-2 giorni;
- entrambi conti propri;
- evidenza aggiuntiva da alias/nome/IBAN mascherato.

MEDIUM:
- stessa cifra e data compatibile ma evidenza incompleta;
- proporre in review;
- non auto-match.

Importo uguale nello stesso giorno NON è sufficiente.

---

# 14. Investment transfer

Bonifico:

```text
ING -> Trade Republic
```

deve essere:

```text
kind = investment_transfer
```

È una trasformazione patrimoniale, non una spesa di consumo.

Escludere da:

- spese mese;
- spese categoria;
- consumption rate.

---

# 15. Categorie

Categorie iniziali:

- Casa
- Mutuo
- Alimentari
- Ristoranti
- Trasporti
- Auto / Carburante
- Utenze e abbonamenti
- Famiglia / Scuola
- Shopping
- Tempo libero
- Viaggi
- Assicurazioni
- Salute
- Donazioni
- Imposte e commissioni
- Entrate / Stipendio
- Interessi
- Trasferimenti
- Investimenti
- Altro

Ordine:

1. override manuale;
2. rule utente;
3. rule applicativa;
4. categoria banca;
5. Altro.

Quando l'utente ricategorizza:

```text
[solo questa]
[questa e future simili]
```

---

# 16. Dashboard

Route:

```text
/
```

## KPI

- Patrimonio netto
- Liquidità
- Investimenti
- Passività
- Entrate mese
- Spese mese
- Risparmio mese
- Savings rate
- Da verificare

## Savings rate

Default:

```text
savings = income - consumptionExpenses
savingsRate = savings / income
```

Escludere:

- internal_transfer;
- investment_transfer.

Il PAC è destinazione del risparmio, non consumo.

---

# 17. Grafici

Recharts, tutti responsive.

## Patrimonio nel tempo

Line chart:

- net worth;
- cash;
- investments.

## Cash flow mensile

Bar chart:

- income;
- expenses;
- savings.

Toggle:

- 6 mesi;
- 12 mesi;
- YTD.

## Spese per categoria

Horizontal bar consigliato su mobile.

Periodo:

- mese;
- trimestre;
- anno.

Escludere trasferimenti/investimenti.

## Asset allocation

Donut:

- current accounts;
- savings/deposit;
- ETF;
- altri investimenti.

## Investimenti

Line:

- contributi cumulati;
- valore corrente.

---

# 18. Conti

Route:

```text
/accounts
```

Supportare:

- ING corrente;
- ING deposito;
- Intesa;
- Trade Republic;
- manuale.

Campi:

- saldo;
- ultimo aggiornamento;
- source;
- alias;
- masked identifier;
- active/closed.

### Saldo ING corrente

Se presente nell'export:
- usare saldo finale.

### Saldo Intesa

Se export non espone saldo:
- aggiornamento manuale.

### ING deposito

MVP:
- manuale;
- parser dedicato futuro.

---

# 19. Movimenti

Route:

```text
/transactions
```

Filtri:

- periodo;
- conto;
- categoria;
- status;
- kind;
- testo;
- range importo.

Azioni:

- categoria;
- tipo;
- nota;
- link transfer;
- create rule;
- exclude from analytics.

Pending con badge.

Mobile -> cards.

---

# 20. Investimenti

Route:

```text
/investments
```

MVP:

- Trade Republic;
- titoli;
- trades manuali;
- holdings;
- valore corrente;
- P/L;
- capitale versato.

```ts
interface Security {
  id: string;
  isin: string;
  ticker?: string;
  name: string;
  assetClass: "equity_etf" | "bond_etf" | "stock" | "bond" | "cash" | "other";
  currency: string;
}

interface Trade {
  id: string;
  investmentAccountId: string;
  securityId: string;
  tradeDate: string;
  side: "buy" | "sell";
  quantity: number;
  priceCents: number;
  feesCents: number;
  source: "manual" | "import";
}
```

Nessuna API market data obbligatoria nell'MVP.

---

# 21. Passività

Route:

```text
/liabilities
```

Mutuo:

- saldo residuo;
- rata;
- tasso;
- tipologia tasso;
- ultimo aggiornamento.

Sottrarre dal net worth.

---

# 22. Net worth snapshots

```ts
interface NetWorthSnapshot {
  id: string;
  date: string;
  cashCents: number;
  investmentsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
}
```

Creazione:

- dopo import;
- pulsante manuale;
- max 1 per giorno, aggiornabile.

---

# 23. Review queue

Route:

```text
/review
```

Elementi:

- pending match ambiguo;
- transfer medio;
- categoria sconosciuta;
- account non riconosciuto;
- parsing warning.

Dashboard:

```text
Da verificare: N
```

---

# 24. Backup

Backup cifrato obbligatorio.

Flow:

```text
IndexedDB snapshot
-> JSON
-> compress
-> AES-GCM
-> .financebackup
```

Chiave:

- PBKDF2 da password;
- salt random;
- IV random.

Restore:

- validate con Zod;
- preview;
- merge default;
- replace opzionale con conferma forte.

---

# 25. Privacy e sicurezza

- nessun analytics;
- nessun tracking;
- niente Sentry;
- niente dati in servizi remoti;
- niente descrizioni finanziarie nei log production;
- niente export reali nel repository;
- fixture sintetiche;
- GitHub Pages contiene solo codice statico;
- dati in IndexedDB del dispositivo.

App lock:
- PIN/password locale opzionale;
- protezione UI;
- non descriverlo come crittografia completa IndexedDB.

---

# 26. PWA

- manifest;
- icone;
- installabile;
- offline shell;
- responsive;
- safe-area iOS;
- viewport corretto;
- no zoom disabilitato;
- touch targets >=44px.

---

# 27. GitHub Pages

Compatibile:

```text
https://<user>.github.io/<repo>/
```

Usare:

- HashRouter consigliato;
- base Vite configurabile;
- GitHub Actions deploy.

---

# 28. Prestazioni

Target:

- 10k transazioni senza degrado evidente;
- import 1k righe <2s su desktop moderno;
- filtri fluidi.

Indici Dexie:

- accountId;
- bookingDate;
- appCategoryId;
- status;
- kind;
- exactFingerprint;
- externalTransactionId.

---

# 29. Test obbligatori

## Parser Intesa

- header dinamico;
- Excel dates;
- posted;
- pending;
- +/- amounts;
- categoria;
- bonifico con ID;
- carta senza ID.

## Parser ING

- header dinamico;
- metadata;
- saldo iniziale/finale;
- date;
- causale;
- CPU id;
- giroconto;
- bonifico;
- fee.

## Delta

Import A:

```text
T1
T2 pending
T3
```

Import B:

```text
T1
T2 posted
T3
T4
```

Expected:

```text
T1 once
T2 once posted
T3 once
T4 once
total = 4
```

## Transfer

Conto A -20.000
Conto B +20.000

Se own account evidence:

- 2 rows;
- 1 TransferLink;
- zero impatto income;
- zero impatto expense;
- zero impatto net worth.

## Manual override

Categoria manuale deve sopravvivere al reimport.

---

# 30. Milestone

## M0 Bootstrap
- React/Vite/TS
- Dexie
- routing
- PWA
- GitHub Pages
- responsive shell
- light/dark

## M1 Domain
- DB
- accounts
- categories
- settings

## M2 Intesa parser
- detect
- parse
- preview
- tests

## M3 ING parser
- detect
- parse
- metadata/balance
- tests

## M4 Delta engine
- ids
- fingerprint
- dedup
- pending reconciliation
- batches
- history
- rollback

NON procedere oltre finché i test core non sono verdi.

## M5 Transactions
- responsive list/table
- filters
- category edits
- rules
- review

## M6 Transfers
- high auto
- medium review
- manual link

## M7 Dashboard
- responsive KPI
- charts
- account cards
- review counter

## M8 Investments
- TR
- trades
- holdings
- graph

## M9 Liabilities
- mortgage
- net worth

## M10 Backup/security
- lock
- encrypted backup
- restore

## M11 Responsive & accessibility QA
- 320 / 375 / 390 px
- tablet
- desktop
- touch
- keyboard
- dark/light
- orientation
- PWA installed

---

# 31. Definition of Done MVP

MVP completo solo se:

1. Intesa import funziona.
2. ING import funziona.
3. Reimport identico -> zero duplicati.
4. Import overlapping -> zero duplicati.
5. Pending Intesa -> posted aggiornato.
6. Transfer propri riconoscibili.
7. Transfer esclusi da spese/entrate.
8. Manual category survives reimport.
9. Dashboard coerente.
10. Almeno 4 grafici.
11. Import history.
12. Backup cifrato.
13. Offline.
14. GitHub Pages.
15. Nessun dato reale repo.
16. **Tutte le route principali sono pienamente usabili a 375px.**
17. Nessun horizontal overflow globale su mobile.
18. Movimenti mobile in card/list, non tabella compressa.
19. Grafici leggibili su mobile.
20. Touch targets accessibili.

---

# 32. Out of scope MVP

- PSD2
- scraping
- cloud auth
- sync multi-device
- backend
- multi-user
- AI categorization
- auto quote API
- push
- fiscalità ETF
- trading
- pagamenti

---

# 33. Priorità

```text
CORRETTEZZA DEL DATO
>
DELTA / DEDUP
>
RESPONSIVE UX
>
DASHBOARD
>
FEATURE EXTRA
```

La grafica non deve mai nascondere errori di riconciliazione.
