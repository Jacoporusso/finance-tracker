# Passività: capitale e rate

Il capitale residuo inserito e la sua data sono il riferimento iniziale. La dashboard, la lista e il dettaglio usano `liabilityProgress`.

- Rate pagate: unione delle rate pagate nel piano e delle rate con un movimento abbinato. Ogni rata conta una volta; una rata successiva non salda quelle mancanti.
- Abbinamento: conto configurato, banca Intesa, numero finanziamento nella descrizione, importo esatto, movimento contabilizzato e data entro 10 giorni. Candidati multipli non vengono abbinati.
- Capitale aggiornato: riferimento manuale meno le quote capitale delle rate non già pagate nel piano, con scadenza successiva alla data di riferimento e movimento riconosciuto. Un rollback elimina automaticamente il relativo aggiornamento derivato.
- I residui riportati nell'Excel restano visibili come dati del piano. Incongruenze tra residui e quote sono segnalate: il capitale aggiornato viene derivato dalle quote, senza copiare un residuo futuro incoerente.
- Quote incoerenti o superiori al capitale rimanente bloccano la riduzione per quella rata e generano un avviso.
- Piani importati col vecchio lettore richiedono una sola ricarica. Dopo configurazione del conto e del numero finanziamento, gli import bancari alimentano gli aggiornamenti senza ricaricare il piano ogni mese.

Il backup comprende piano, configurazione e riferimento manuale; il ripristino valida anche date, importi e struttura delle rate.

La liquidità è la somma degli ultimi saldi registrati dei conti correnti, depositi e contanti attivi. Il patrimonio netto comprende tutti i saldi attivi, inclusi broker e altri conti, meno le passività aggiornate. L'import dei movimenti non ricostruisce automaticamente un saldo bancario mancante.
