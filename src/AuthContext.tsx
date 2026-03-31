import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User } from './types';
import { apiFetch } from './lib/apiFetch';
import { supabase } from './lib/supabaseClient';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);

  const normalizeEmail = (email: string) => email.trim().toLowerCase();

  const buildFallbackUser = (email: string, fallback?: Partial<User> | null): User => {
    const fallbackEmail = normalizeEmail(fallback?.email || email);
    const fallbackName =
      String(fallback?.name || fallbackEmail.split('@')[0] || 'Usuario').trim() || 'Usuario';

    return {
      id: fallback?.id ?? 0,
      tenant_id: fallback?.tenant_id ?? 0,
      sector_id: fallback?.sector_id ?? 0,
      name: fallbackName,
      email: fallbackEmail,
      role: fallback?.role === 'admin' ? 'admin' : 'user',
      theme: fallback?.theme === 'dark' ? 'dark' : 'light',
      sector_name: fallback?.sector_name,
      tenant_name: fallback?.tenant_name,
    };
  };

  const safeGetLocalUser = () => {
    try {
      return localStorage.getItem('user');
    } catch {
      return null;
    }
  };

  const safeSetLocalUser = (value: User) => {
    try {
      localStorage.setItem('user', JSON.stringify(value));
    } catch {
      // Ignore storage failures (private mode or blocked storage)
    }
  };

  const safeRemoveLocalUser = () => {
    try {
      localStorage.removeItem('user');
    } catch {
      // Ignore storage failures
    }
  };

  const safeGetParsedLocalUser = (): User | null => {
    const raw = safeGetLocalUser();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      safeRemoveLocalUser();
      return null;
    }
  };

  const clearLocalUser = () => {
    setUser(null);
    safeRemoveLocalUser();
  };

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;

        if (error || !data.session) {
          clearLocalUser();
          return;
        }

        const email = data.session.user.email || '';
        const savedUser = safeGetParsedLocalUser();

        if (savedUser && normalizeEmail(savedUser.email || '') === normalizeEmail(email)) {
          setUser(savedUser);
          safeSetLocalUser(savedUser);
          return;
        }

        const fallbackUser = buildFallbackUser(email, savedUser);
        setUser(fallbackUser);
        safeSetLocalUser(fallbackUser);
      } catch (err) {
        console.error('Auth init failed:', err);
        clearLocalUser();
      } finally {
        if (active) setLoading(false);
      }
    };

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (!session) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            return;
          }
          clearLocalUser();
          return;
        }

        const sessionEmail = normalizeEmail(session.user.email || '');
        const currentUser = userRef.current;
        if (currentUser && normalizeEmail(currentUser.email || '') === sessionEmail) {
          return;
        }

        const cachedUser = safeGetParsedLocalUser();
        if (cachedUser && normalizeEmail(cachedUser.email || '') === sessionEmail) {
          setUser(cachedUser);
          safeSetLocalUser(cachedUser);
          return;
        }

        const fallbackUser = buildFallbackUser(session.user.email || '', cachedUser);
        setUser(fallbackUser);
        safeSetLocalUser(fallbackUser);
      } catch (err) {
        console.error('Auth state change failed:', err);
      }
    });

    return () => {
      active = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string, retries = 3) => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        safeSetLocalUser(userData);
      } else {
        const errorData = await res.json();
        const errorMessage = errorData.error || 'Login failed';
        console.error('Login Error:', errorData);
        throw new Error(errorMessage);
      }
    } catch (err) {
      if (retries > 0 && err instanceof Error && err.message === 'Failed to fetch') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return login(email, password, retries - 1);
      }
      throw err;
    }
  };

  const signup = async (email: string, name: string, password: string) => {
    try {
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });
      if (res.ok) {
        // After signup, we can automatically log them in
        await login(email, password);
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Signup failed');
      }
    } catch (err) {
      throw err;
    }
  };

  const logout = () => {
    void supabase.auth.signOut();
    setUser(null);
    safeRemoveLocalUser();
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
