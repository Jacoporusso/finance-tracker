# Personal Finance Tracker

PWA personale local-first per aggregare esportazioni bancarie Intesa Sanpaolo e ING: import incrementali con anteprima, movimenti, saldi, passività manuali e dashboard. Trade Republic è rimandato.

## Sviluppo

```sh
npm install
npm run dev
```

Controlli di sviluppo consentiti agli agenti:

```sh
npm run typecheck
npm run lint
```

Per richiesta dell'utente non si aggiungono né eseguono unit test. Gli agenti non devono eseguire build né avviare workflow di build: l'utente fornirà l'output se necessario. Le verifiche visuali usano il server di sviluppo.

L'app usa HashRouter e route annidate con un layout comune. `src/app/` contiene router e provider, `src/components/` i componenti condivisi, `src/pages/` le pagine, `src/domain/` i tipi e le conversioni, `src/db/` la persistenza e la validazione.

Gli stili usano Tailwind CSS 4 e variabili CSS semantiche in `src/styles.css`; le icone sono Heroicons. Tailwind Typography è usato per i testi descrittivi. Nessun font viene scaricato a runtime.

IndexedDB conserva i dati sul dispositivo. La versione 3 aggiunge movimenti, import e passività senza cancellare conti, categorie o impostazioni. I saldi sono centesimi interi; un saldo sconosciuto resta assente. Le categorie iniziali vengono inserite senza sovrascrivere le rinomine. Il tema supporta chiaro, scuro e preferenza del dispositivo.

## Primo utilizzo

1. Apri **Import**, seleziona un Excel ING o Intesa e scegli il conto di destinazione; puoi creare il conto dalla stessa pagina.
2. Esamina nuovi movimenti, aggiornamenti, duplicati ed eventuali errori. L'anteprima non salva movimenti.
3. Conferma l'import. Se ING contiene un saldo finale con data, scegli esplicitamente se aggiornare il saldo noto.
4. In **Conti**, inserisci il saldo Intesa quando il file contiene solo movimenti. La somma di un periodo di operazioni non è il saldo corrente.
5. Apri **Dashboard** per patrimonio e flussi, **Movimenti** per categorie/tipi/note, **Passività** per eventuali debiti residui.

Se l'export ING contiene operazioni bancarie con causale `Giroconto`, l'app le propone come trasferimenti interni: non entrano nelle spese o nelle entrate. Se il lato deposito non è stato importato, puoi correggere i movimenti dalla scheda dedicata in Dashboard e inserire manualmente il saldo effettivo del conto deposito. Le chip colorate nei movimenti distinguono spese, entrate, commissioni, interessi e trasferimenti.

Il patrimonio usa i saldi conosciuti dei conti attivi, meno le passività. Se mancano saldi, il totale è parziale. I saldi possono avere date diverse: verifica sempre la loro data. I trasferimenti riconosciuti tra conti propri sono esclusi da entrate e spese; aggiungi alias riconoscibili dei tuoi conti e verifica i casi dubbi.

Gli import non sostituiscono lo storico. I file identici già confermati vengono bloccati; i periodi sovrapposti vengono riconciliati. Lo storico permette di annullare gli import dal più recente, bloccando l'operazione se sovrascriverebbe modifiche successive. Il backup cifrato non è ancora disponibile: conserva gli export originali e non cancellare i dati del sito.

Per GitHub Pages, il workflow esistente imposta il base path del repository. Gli export reali non vanno mai committati: `.local-imports/` è esclusa da Git e non viene usata dall'app o copiata nella cartella pubblica. Per sviluppare i parser usare campioni anonimizzati che mantengano fogli, colonne, tipi Excel e righe di intestazione originali.
