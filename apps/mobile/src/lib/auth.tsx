import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { SESSION_STORAGE_KEY, supabase } from './supabase';

/**
 * The session saved on the phone, read without waiting on the network. getSession() refreshes
 * an expired token before it answers, which held the splash screen up on a slow connection;
 * the saved session is enough to know who's signed in, and the client refreshes the token
 * itself before any request that needs it.
 */
function savedSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    return session?.user?.id && session.refresh_token ? session : null;
  } catch {
    return null;
  }
}

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>(() => {
    const saved = savedSession();
    return saved ? { session: saved, loading: false } : { session: null, loading: true };
  });

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) =>
        // Offline or timed out: keep the saved session rather than signing someone out.
        setState((prev) => (error ? { ...prev, loading: false } : { session: data.session, loading: false })),
      )
      .catch(() => setState((prev) => ({ ...prev, loading: false })));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
