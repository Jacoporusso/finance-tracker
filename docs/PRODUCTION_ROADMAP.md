# Consolidamento per l'uso quotidiano

Una milestone alla volta, con controlli sui dati e UI responsive. Nessuna build automatica: la verifica della distribuzione e della PWA richiede una build eseguita dall'utente.

1. Saldi: riferimento a fine giornata, aggiornamento opzionale dai movimenti contabilizzati, saldi mancanti/datati evidenti. Default conservativo per gli archivi esistenti. Import e rollback non possono duplicare le variazioni.
2. Storico patrimoniale: istantanee datate di liquidità, investimenti e debiti, con provenienza e indicazione dei dati parziali. Nessuna ricostruzione fittizia del passato.
3. Investimenti: valorizzazioni datate, contributi/prelievi e distinzione tra andamento del valore e rendimento.
4. Regole: anteprima dell'effetto, applicazione a movimenti selezionati/futuri, preservazione degli override.
5. Crediti e rimborsi tra persone: anticipi, restituzioni e importi ancora da ricevere.
6. Spese ricorrenti e previsione degli impegni.
7. Backup: promemoria e verifica del ripristino.
8. Provider: adattatori che restituiscono movimenti, saldi e piani normalizzati; registrazione delle capacità per banca. Il motore dei saldi resta indipendente dal provider. Connessioni Open Banking non incluse: backend, fornitore e trattamento dati richiedono una decisione separata.

Per ogni milestone: leggibilità mobile, stati caricamento/vuoto/errore, feedback delle operazioni, controlli di dominio e backup. Prima del rilascio: controllo completo delle route, dipendenze, accessibilità e verifica offline/installazione su build fornita dall'utente.
