import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';

describe('app shell', () => {
  afterEach(cleanup);

  it('shows the responsive dashboard placeholder and primary navigation', () => {
    window.location.hash = '#/';
    render(<HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /></HashRouter>);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Patrimonio nel tempo' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigazione mobile' })).toBeInTheDocument();
  });

  it('makes secondary routes reachable from the mobile navigation', () => {
    window.location.hash = '#/';
    render(<HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /></HashRouter>);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navigazione mobile' })).getByRole('button', { name: 'Altre sezioni' }));
    fireEvent.click(within(screen.getByLabelText('Menu altre sezioni')).getByRole('link', { name: /Impostazioni/ }));
    expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeInTheDocument();
  });
});
