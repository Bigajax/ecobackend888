// src/contexts/AuthContext.tsx
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
  loading: boolean; // Adicione 'loading' aqui para que o ProtectedRoute possa usá-lo
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
        });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
        });
        // AQUI REMOVEMOS O REDIRECIONAMENTO PROBLEMÁTICO
        // if (window.location.pathname !== '/chat') {
        //   navigate('/chat');
        // }
      } else {
        setUser(null);
        if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
          navigate('/login');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error || !data.user) throw new Error('Erro ao fazer login');
    setUser({
      id: data.user.id,
      email: data.user.email || '',
      full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
    });
  };

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  };

  const register = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
        if (error.message.includes('User already registered')) {
            throw new Error('Este e-mail já está registrado. Tente fazer login.');
        }
        throw new Error(error.message || 'Erro ao criar conta');
    }
    if (data.user) {
        setUser({
            id: data.user.id,
            email: data.user.email || '',
            full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
        });
    } else {
        throw new Error('Verifique seu e-mail para confirmar a criação da conta.');
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple', redirectTo?: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo || `${window.location.origin}/chat`,
      },
    });
    setLoading(false);
    if (error) throw new Error(error.message || `Erro ao fazer login com ${provider}`);
  };

  // AQUI ESTÁ A MUDANÇA CRÍTICA: Incluir todas as funções no objeto value
  const value = {
    user,
    loading,
    login, // Adicione aqui
    logout, // Adicione aqui
    register, // Adicione aqui
    signInWithOAuth, // Adicione aqui
  };

  // O spinner de carregamento no AuthProvider (opcional, pode ser removido se o ProtectedRoute o faz)
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <p className="text-gray-700">Carregando autenticação...</p>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}