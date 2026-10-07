import { createSlice } from '@reduxjs/toolkit';

// Two independent sessions: the platform admin console and the customer
// (tenant user) dashboard. Tokens are kept in Redux and mirrored to
// localStorage (see store/index.js) so a reload keeps you signed in.

export const REALMS = ['admin', 'customer'];
export const tokenStorageKey = (realm) => `aurlynn.${realm}.tokens`;

function loadTokens(realm) {
  try {
    const raw = localStorage.getItem(tokenStorageKey(realm));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const authSlice = createSlice({
  name: 'auth',
  initialState: () => ({
    admin: { tokens: loadTokens('admin') },
    customer: { tokens: loadTokens('customer') },
  }),
  reducers: {
    tokensReceived(state, { payload: { realm, tokens } }) {
      state[realm].tokens = { ...(state[realm].tokens ?? {}), ...tokens };
    },
    loggedOut(state, { payload: realm }) {
      state[realm].tokens = null;
    },
  },
});

export const { tokensReceived, loggedOut } = authSlice.actions;
export default authSlice.reducer;

export const selectTokens = (realm) => (state) => (realm ? state.auth[realm].tokens : null);
export const selectAccessToken = (realm) => (state) => (realm ? state.auth[realm].tokens?.access_token : undefined);
