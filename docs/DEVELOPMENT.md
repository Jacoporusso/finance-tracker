# Stato dello sviluppo

## Decisioni concordate

- React con HashRouter, route annidate e layout condiviso; pagine separate dalla persistenza.
- Tailwind CSS 4, variabili CSS per colori e temi, Heroicons, Tailwind Typography per contenuti descrittivi. Nessun Sass o font remoto.
- Team di subagent a basso costo, integrazione e revisione centrale.
- Nessun unit test da aggiungere o eseguire. Nessun comando di build da eseguire dagli agenti, nemmeno tramite workflow remoto. L'utente può fornire un output di build su richiesta.
- Typecheck e lint consentiti; verifiche responsive sul server di sviluppo.

## M1 — Conti, categorie, impostazioni

- Dexie v2 aggiunge conti e categorie mantenendo lo schema settings v1.
- Saldo facoltativo in integer cents e data YYYY-MM-DD. Zero è distinto da saldo sconosciuto.
- Creazione/modifica conti, archiviazione reversibile, identificativi mascherati e alias.
- Categorie iniziali, creazione e rinomina; nessuna cancellazione.
- Preferenze locali: tema chiaro/scuro/sistema, EUR, it-IT, Europe/Rome.
- Componenti condivisi, pagine dedicate, gestione degli errori locali, menu mobile con dialog nativo.

M1 è stata seguita dall'integrazione import, movimenti e dashboard descritta sotto. La route Investimenti resta rinviata su richiesta dell'utente.

Verifiche M1: typecheck e lint; 9 route a 375×812, 768×1024 e 1366×768 (27 controlli) sul server di sviluppo, senza overflow orizzontale né errori runtime. In un profilo browser isolato con dati sintetici: creazione conto e persistenza al reload, cancellazione esplicita del saldo manuale, archiviazione e riattivazione, 20 categorie iniziali, rinomina mantenuta al reload, tema persistente, menu mobile. Nessuna build o unit test eseguita per M1. I parser e le acceptance di import non sono ancora implementati/verificati.

## Import e dashboard — ambito concordato

- Parser Intesa e ING con intestazioni dinamiche, date Excel e importi in centesimi. Errori di riga bloccanti e identificativi conto mascherati. Rifiuto dei workbook ambigui e degli export Intesa contenenti più conti.
- Caricamento da file picker o drag & drop, selezione/creazione esplicita del conto, anteprima, conferma atomica. Gli export reali non sono incorporati nell'app.
- Deduplica per ID esterno, fingerprint con conteggio delle occorrenze, riconciliazione conservativa pending/posted. I dati manuali sopravvivono e un export pending precedente non riporta indietro lo stato contabilizzato.
- Controllo della validità dell'anteprima rispetto al DB corrente; import bloccato se i dati sono cambiati. Storico e annullamento dall'ultimo import, con protezione delle modifiche successive.
- Trasferimenti automatici solo con corrispondenza univoca e alias reciproci. Le corrispondenze ambigue restano visibili in Da verificare.
- Movimenti con tabella desktop, schede mobile, filtri, caricamento progressivo e modifica di categoria/tipo/nota.
- Dashboard con selezione mese, entrate/spese/risparmio, grafici di flusso/categorie/saldi, saldi datati e patrimonio netto. Il totale è esplicitamente parziale quando un conto attivo non ha saldo. I debiti manuali vengono sottratti.
- Il saldo ING proposto si può accettare o mantenere invariato; i saldi più vecchi non sostituiscono quelli recenti. Intesa richiede saldo manuale quando l'export contiene solo operazioni.

Verifiche browser eseguite con profilo isolato e dati sintetici: anteprima senza scritture, stesso file bloccato, overlap senza duplicati, pending/posted con stessa identità, categorie/note manuali conservate, trasferimenti esclusi dai flussi, saldo ING, rollback con ripristino contropartita e pending, rifiuto di anteprima obsoleta e di rollback che sovrascriverebbe modifiche manuali. Verificata anche la molteplicità di righe identiche e la conservazione del saldo manuale quando non si accetta quello importato.

Typecheck e lint finali superati. Le 10 route sono state verificate a 375×812, 768×1024 e 1366×768: 30 controlli senza overflow globale o errori runtime. Verificati anche identificativi esterni condivisi, ambiguità nei trasferimenti, modifica manuale di una coppia collegata, salvataggio note dall'interfaccia, inserimento passività e menu mobile con tema scuro. I due export forniti sono stati verificati localmente in anteprima (13 righe ciascuno, nessun errore), senza importare dati reali nel profilo dell'utente né stamparli nei log. Nessuna build o unit test eseguita.

## Ancora fuori da questo incremento

Trade Republic, gestione titoli, storico patrimoniale a snapshot, regole di categorizzazione personalizzate e backup cifrato. Le verifiche offline della versione di produzione e del deploy richiedono una build eseguita dall'utente. Conservare gli export originali: IndexedDB non è un backup.

Audit dipendenze: l'audit delle sole dipendenze runtime segnala due avvisi moderati sulla famiglia React Router 6 (redirect e hydration SSR). L'app usa route locali fisse e non usa SSR. Aggiornamento major delle dipendenze da trattare separatamente, con verifica della build dell'utente.
