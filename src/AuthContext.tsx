import React, { createContext, useContext, useState, useEffect } from 'react';
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

  const normalizeEmail = (email: string) => email.trim().toLowerCase();

  const loadProfileForEmail = async (email: string): Promise<User | null> => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return null;

    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        sector_name:sectors(name),
        tenant_name:tenants(name)
      `)
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (error || !data) return null;
    return {
      ...data,
      sector_name: data?.sector_name?.name,
      tenant_name: data?.tenant_name?.name,
    };
  };

  const clearLocalUser = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (!data.session) {
        clearLocalUser();
        setLoading(false);
        return;
      }

      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
        setLoading(false);
        return;
      }

      const email = data.session.user.email || '';
      const profile = await loadProfileForEmail(email);
      if (profile) {
        setUser(profile);
        localStorage.setItem('user', JSON.stringify(profile));
      } else {
        await supabase.auth.signOut();
        clearLocalUser();
      }
      setLoading(false);
    };

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        clearLocalUser();
        return;
      }
      const profile = await loadProfileForEmail(session.user.email || '');
      if (profile) {
        setUser(profile);
        localStorage.setItem('user', JSON.stringify(profile));
      } else {
        clearLocalUser();
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
        localStorage.setItem('user', JSON.stringify(userData));
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
    localStorage.removeItem('user');
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
