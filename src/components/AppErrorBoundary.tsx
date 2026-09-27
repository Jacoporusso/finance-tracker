import { Component, type ReactNode } from 'react';

export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-semibold">La pagina non è disponibile</h1><p className="mt-3 text-muted">Ricarica per riprovare. I dati già salvati restano nell'archivio del browser.</p><button type="button" className="mt-4 min-h-11 rounded-xl border border-line px-4" onClick={() => window.location.reload()}>Ricarica</button></div>;
    return this.props.children;
  }
}
