import { createContext, useContext } from 'react';
import type { Preferences } from '../domain/models';

export interface SettingsContextValue {
  preferences: Preferences;
  isDark: boolean;
  saving: boolean;
  changeTheme: (theme: Preferences['theme']) => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('SettingsProvider mancante');
  return value;
}
