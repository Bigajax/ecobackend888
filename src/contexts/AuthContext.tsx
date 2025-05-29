import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface User {
  id: string;
  email: string;
  full_name?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'apple', redirectTo?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadSession = async () => {
      console.log('[AuthContext] Checking session...');
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('[AuthContext] Error fetching session:', error.message);
      }

      if (data.session?.user) {
        const sessionUser = data.session.user;
        setUser({
          id: sessionUser.id,
          email: sessionUser.email || '',
          full_name: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || '',
        });
        console.log('[AuthContext] User loaded from session:', sessionUser.email);
      } else {
        console.log('[AuthContext] No active session.');
        setUser(null);
      }
      setLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[AuthContext] onAuthStateChange event:', _event);
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
        });
        console.log('[AuthContext] User updated from auth state change:', session.user.email);
      } else {
        setUser(null);
        console.log('[AuthContext] User signed out or session expired.');
      }
    });

    return () => {
      subscription.unsubscribe();
      console.log('[AuthContext] Unsubscribed from auth state changes.');
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error || !data.user) {
      throw new Error(error?.message || 'Erro ao fazer login');
    }

    setUser({
      id: data.user.id,
      email: data.user.email || '',
      full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
    });
    console.log('[AuthContext] User logged in:', data.user.email);
  };

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    sessionStorage.removeItem('chatMessages');
    setUser(null);
    setLoading(false);
    console.log('[AuthContext] User logged out.');
  };

  const register = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      throw new Error(error.message || 'Erro ao criar conta');
    }

    if (data.user) {
      setUser({
        id: data.user.id,
        email: data.user.email || '',
        full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
      });
      console.log('[AuthContext] User registered:', data.user.email);
    } else {
      throw new Error('Verifique seu e-mail para confirmar a criação da conta.');
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple', redirectTo?: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo || `${window.location.origin}/chat` },
    });
    setLoading(false);

    if (error) {
      throw new Error(error.message || `Erro ao fazer login com ${provider}`);
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    register,
    signInWithOAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
