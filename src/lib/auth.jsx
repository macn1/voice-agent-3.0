import { createContext, useCallback, useContext, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useGetMeQuery, useLoginMutation, useLogoutMutation } from '../store/api/authApi';
import { selectTokens } from '../store/slices/authSlice';
import { permissionsOf } from './normalize';

// Which session a subtree belongs to (admin console vs customer dashboard).
// Tokens and the profile live in Redux / the RTK Query cache.
const RealmContext = createContext('customer');

export function RealmProvider({ realm, children }) {
  return <RealmContext.Provider value={realm}>{children}</RealmContext.Provider>;
}

export const useRealm = () => useContext(RealmContext);

/**
 * Session for the current realm:
 * { realm, profile, status: 'loading'|'signed-in'|'signed-out', can(code), login, logout }
 */
export function useAuth() {
  const realm = useRealm();
  const tokens = useSelector(selectTokens(realm));
  const me = useGetMeQuery(realm, { skip: !tokens?.access_token });
  const [loginMutation] = useLoginMutation();
  const [logoutMutation] = useLogoutMutation();

  // No token → signed out. A 401 the refresh can't fix clears the token in the
  // base query, which lands here as signed out too. Other errors (network,
  // 5xx) keep the session so the UI can show what it has.
  const rejected = me.error && [401, 403].includes(me.error.status);
  const status = !tokens?.access_token || rejected ? 'signed-out' : me.data ? 'signed-in' : me.isLoading || me.isUninitialized ? 'loading' : 'signed-in';
  const profile = tokens?.access_token ? (me.data ?? null) : null;

  const login = useCallback(async (email, password) => loginMutation({ realm, email, password }).unwrap(), [loginMutation, realm]);
  const logout = useCallback(async () => {
    await logoutMutation({ realm, refresh_token: tokens?.refresh_token ?? '' });
  }, [logoutMutation, realm, tokens]);

  return useMemo(() => {
    const perms = permissionsOf(profile, tokens?.access_token);
    return {
      realm,
      profile,
      status,
      can: (code) => perms === null || perms.has(code) || perms.has('*'),
      login,
      logout,
    };
  }, [realm, profile, status, tokens, login, logout]);
}

/** Human message for sign-in failures (P-01 states). */
export function loginErrorMessage(e) {
  if (!e || typeof e !== 'object' || !('status' in e)) return 'Something went wrong. Please try again.';
  const code = String(e.code ?? '').toLowerCase();
  if (e.status === 429 || code.includes('too_many') || code.includes('rate')) return 'Too many attempts. Wait a minute and try again.';
  if (code.includes('suspend')) return 'Your company account is suspended. Contact support to restore access.';
  if (code.includes('disabled') || code.includes('inactive')) return 'Your account is disabled. Ask your admin to re-enable it.';
  if (code === 'invalid_credentials' || e.status === 401) return 'Incorrect email or password.';
  return e.message ?? 'Sign-in failed.';
}
