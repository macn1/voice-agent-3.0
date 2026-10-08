import { useCallback, useSyncExternalStore } from 'react';

// Light/dark theme. The choice lives on <html data-theme> (read by global.css)
// and in localStorage; index.html applies it before first paint so there is no flash.
const STORAGE_KEY = 'aurlynn.theme';
const listeners = new Set();

function current() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage blocked: the theme lasts for this page load only */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** { theme: 'light'|'dark', toggle() } */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, current);
  const toggle = useCallback(() => setTheme(current() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
}
