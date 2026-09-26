# Personal Finance Tracker

PWA personale local-first per aggregare esportazioni bancarie. M0 contiene lo scaffold React + TypeScript, la shell responsive, le route placeholder, un database IndexedDB versionato e il deploy statico su GitHub Pages.

## Sviluppo

```sh
npm install
npm run dev
```

Controlli disponibili:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

L'app usa HashRouter per supportare il routing statico. Per GitHub Pages, la workflow imposta automaticamente il base path del repository. I dati dell'app restano nel browser; M0 non implementa ancora importazioni o dati finanziari.
