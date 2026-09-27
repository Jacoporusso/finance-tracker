# Saldi dei conti

I saldi snapshot mostrano l’ultimo importo registrato e la relativa data. Per i conti non broker, la modalità derivata usa quel saldo come chiusura della giornata indicata e somma i movimenti contabilizzati con data successiva, fino a oggi incluso. Tutti i tipi di movimento contribuiscono, perché ciascuno cambia il saldo del conto; i pending sono conteggiati a parte e non modificano l’importo.

Movimenti del giorno di riferimento sono già compresi nel saldo e non vengono sommati una seconda volta. Le operazioni future sono escluse. Senza saldo e data di riferimento non viene stimato alcun importo. I saldi oltre 30 giorni sono segnalati come datati anche quando esistono movimenti recenti: la loro presenza non dimostra che lo storico sia completo. Importi non sicuri producono un saldo mancante invece di un valore potenzialmente errato. Il calcolo è in memoria e non modifica il database.
