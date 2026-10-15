import { useSyncExternalStore } from 'react';

// Tracks which API routes were answered with demo data instead of the backend,
// so the UI can label them ("Demo data") and nobody mistakes them for live data.

let served = new Map(); // "METHOD service path" -> realm
let snapshot = { count: 0, routes: [] };
const listeners = new Set();

export function markDemoServed({ service, url, method = 'GET', realm }) {
  const key = `${method} ${service}${url}`;
  if (served.has(key)) return;
  served.set(key, realm ?? 'public');
  snapshot = { count: served.size, routes: [...served.keys()] };
  listeners.forEach((l) => l());
}

export function resetDemoServed() {
  served = new Map();
  snapshot = { count: 0, routes: [] };
  listeners.forEach((l) => l());
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** { count, routes } of demo-served requests this session. */
export const useDemoServed = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
