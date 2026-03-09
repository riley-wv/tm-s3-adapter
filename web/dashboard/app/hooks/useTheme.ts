'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../lib/types';

const STORAGE_KEY = 'tm-theme';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const apply = (t: ThemeMode) => {
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      const wantsDark = t === 'dark' || (t === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', wantsDark);
    };

    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
