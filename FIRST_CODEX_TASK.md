# FIRST_CODEX_TASK.md

Implementare **M0 — Bootstrap** e fermarsi.

Leggere prima:

- `AGENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/IMPORT_NORMALIZATION.md`

## Scope M0

Creare:

- React + TypeScript strict + Vite;
- routing con HashRouter;
- Dexie installato e DB iniziale versionato;
- vite-plugin-pwa;
- shell responsive;
- light/dark mode;
- navigazione desktop + mobile;
- placeholder routes:
  - Dashboard
  - Import
  - Movimenti
  - Conti
  - Investimenti
  - Passività
  - Review
  - Impostazioni
- GitHub Pages build/deploy workflow;
- test base;
- lint/typecheck.

## Responsive DoD

Verificare:

- 375x812
- 768x1024
- 1366x768

Nessun horizontal overflow.

Desktop:
- sidebar.

Mobile:
- bottom nav o drawer.
- nessuna sidebar persistente.

Dashboard placeholder:
- KPI cards responsive;
- due chart placeholder responsive;
- account cards.

Non implementare ancora parser bancari.

## Fine task

Eseguire:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Fermarsi e riportare:

- file creati;
- decisioni architetturali;
- risultati test;
- eventuali blocker.

Non proseguire a M1 senza richiesta esplicita.
