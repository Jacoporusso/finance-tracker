# IMPORT_NORMALIZATION.md

## Intesa Sanpaolo

### Foglio

```text
Lista Operazione
```

### Header dinamico

Cercare una riga contenente:

```text
Data | Operazione | Dettagli | Conto o carta | Contabilizzazione | Categoria | Valuta | Importo
```

Non hardcodare la riga.

### Mapping

```text
Data                -> bookingDate
Operazione          -> sourceOperation
Dettagli            -> rawDescription
Conto o carta       -> sourceAccountLabel
Contabilizzazione   -> status
Categoria           -> sourceCategory
Valuta              -> currency
Importo             -> amount
```

### Stato

```text
CONTABILIZZATO      -> posted
NON CONTABILIZZATO  -> pending
```

### Note

- Excel serial dates.
- amount signed.
- card transaction può non avere transaction ID.
- bonifici/commissioni possono contenere ID tecnici.
- pending può diventare posted in export successivo.

---

## ING Conto Corrente Arancio

### Foglio

```text
MovimentiContoCorrenteArancio
```

### Header dinamico

```text
DATA CONTABILE
DATA VALUTA
CAUSALE
DESCRIZIONE OPERAZIONE
IMPORTO IN EURO
```

### Mapping

```text
DATA CONTABILE          -> bookingDate
DATA VALUTA             -> valueDate
CAUSALE                 -> sourceOperation
DESCRIZIONE OPERAZIONE  -> rawDescription
IMPORTO IN EURO         -> amount
```

Defaults:

```text
currency = EUR
status   = posted
```

### Metadata

Estrarre se presenti:

- masked account / IBAN;
- initial balance;
- closing balance;
- date range.

---

# External IDs

## ING

Provare:

```regex
\bN\.\s*([A-Z0-9]+)\b
```

Se più candidati:
- preferire token CPU;
- altrimenti identificatore strutturato principale.

## Intesa

Provare:

```regex
COD\.?\s*DISP\.?\s*([A-Z0-9]+)
```

Supportare pattern aggiuntivi in future parser versions.

---

# Fingerprints

## Exact

```text
bank
account
booking date
value date
amount cents
currency
normalized operation
normalized description
```

## Fuzzy

```text
bank
account
amount cents
currency
normalized merchant/operation
```

Fuzzy = candidate finder, non unique key.

---

# Pending reconciliation

Candidate:

```text
same account
same amount
same currency
date difference <= 4 days
merchant/operation compatible
```

Un solo high-confidence match:
- update existing.

Ambiguo:
- review.

---

# Transfer matching

High confidence:

```text
amount exact opposite
currency same
date +/-2 days
both own accounts
owner/account evidence present
```

Medium:
- amount/date match
- both own accounts
- evidence incomplete

Medium -> review only.

---

# Delta imports

Un file nuovo non sostituisce dati vecchi.

```text
existing exact id -> matched
existing exact fingerprint -> matched
pending candidate -> reconcile
otherwise -> insert
```

Movimento assente nel nuovo file:
- non cancellare.

File già importato:
- riconoscere SHA-256;
- bloccare reimport identico oppure mostrare "già importato".

---

# Manual data precedence

Persistenza:

```text
manual category > rule category > bank category
manual kind > auto kind
manual transfer link > auto matcher
```

Un reimport non deve cancellare modifiche utente.

---

# Privacy

I file reali usati per definire il formato NON fanno parte del repository.

Creare fixture sintetiche con:
- struttura equivalente;
- metadati fittizi;
- IBAN finti;
- nomi finti;
- importi fittizi.
