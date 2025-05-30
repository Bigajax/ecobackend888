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
  register: (email: string, password: string, fullName?: string) => Promise<void>;
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
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[AuthContext] Error fetching session:', error.message);
      }

      if (data.session?.user) {
        const sessionUser = data.session.user;
        setUser({
          id: sessionUser.id,
          email: sessionUser.email || '',
          full_name:
            sessionUser.user_metadata?.full_name ||
            sessionUser.user_metadata?.name ||
            sessionUser.user_metadata?.given_name || '', // pega também nome do Google OAuth
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthContext] onAuthStateChange event:', event);
      if (event === 'SIGNED_IN' && session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          full_name:
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            session.user.user_metadata?.given_name || '',
        });
        navigate('/chat');
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        navigate('/login');
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [navigate]);

  const fetchFreshUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw new Error(error?.message || 'Erro ao buscar usuário atualizado');
    }
    return {
      id: data.user.id,
      email: data.user.email || '',
      full_name:
        data.user.user_metadata?.full_name ||
        data.user.user_metadata?.name ||
        data.user.user_metadata?.given_name || '',
    };
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      throw new Error(error?.message || 'Erro ao fazer login');
    }

    const freshUser = await fetchFreshUser();
    setUser(freshUser);
    setLoading(false);
  };

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    sessionStorage.removeItem('chatMessages');
    setUser(null);
    setLoading(false);
  };

  const register = async (email: string, password: string, fullName = '') => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) {
      setLoading(false);
      throw new Error(error.message || 'Erro ao criar conta');
    }

    const freshUser = await fetchFreshUser();
    setUser(freshUser);
    setLoading(false);
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
