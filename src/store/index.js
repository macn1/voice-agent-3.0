import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from './api/baseApi';
import authReducer, { REALMS, tokenStorageKey } from './slices/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
});

// Refetch on focus / reconnect for queries that opt in.
setupListeners(store.dispatch);

// Mirror tokens to localStorage so a reload keeps both sessions.
let last = {};
store.subscribe(() => {
  const auth = store.getState().auth;
  REALMS.forEach((realm) => {
    const tokens = auth[realm].tokens;
    if (tokens === last[realm]) return;
    last[realm] = tokens;
    try {
      if (tokens) localStorage.setItem(tokenStorageKey(realm), JSON.stringify(tokens));
      else localStorage.removeItem(tokenStorageKey(realm));
    } catch {
      /* storage blocked: session lasts for this tab only */
    }
  });
});
