const reasons: Record<string, string> = {
  'pending-posted-reconciled': 'Riconciliato con un movimento già presente in attesa.',
  'bank-fields-updated': 'Aggiornati i dati bancari del movimento esistente.',
  'ambiguous-external-id': 'Identificativo condiviso da più movimenti: verifica necessaria.',
  'external-id-conflict': 'Identificativo già presente con dati differenti: verifica la corrispondenza.',
  'ambiguous-pending-posted-match': 'Più possibili corrispondenze con movimenti in attesa.',
  'transfer-matched': 'Trasferimento riconosciuto tra due tuoi conti.',
  'possible-internal-transfer': 'Possibile trasferimento tra conti propri: verifica il tipo del movimento.',
  'possible-transfer': 'Possibile trasferimento tra conti propri: verifica il tipo del movimento su entrambi i conti.',
  'possible-transfer-review': 'Trasferimento da verificare: mancano elementi per una corrispondenza certa.',
  'ambiguous-transfer': 'Più possibili contropartite: verifica il trasferimento.',
  'stale-pending': 'Il movimento è già contabilizzato; conservati i dati più recenti.',
  'stale-pending-ignored': 'Il movimento è già contabilizzato; conservati i dati più recenti.',
};

export function importReason(reason: string): string {
  return reasons[reason] ?? reason;
}
