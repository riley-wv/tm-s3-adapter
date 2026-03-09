'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../lib/types';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tm-theme') as ThemeMode | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const apply = (t: ThemeMode) => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const wantsDark = t === 'dark' || (t === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', wantsDark);
    };

    apply(theme);
    try { localStorage.setItem('tm-theme', theme); } catch { /* ignore */ }

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemeMode) => setThemeState(t), []);

  return { theme, setTheme };
}
