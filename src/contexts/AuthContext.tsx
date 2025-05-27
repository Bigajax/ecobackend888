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
    console.log('AuthContext useEffect: Chamando getSession...');
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // --- Adicionado para depuração ---
      console.log('AuthContext useEffect: getSession data.session:', session);
      if (error) {
        console.error('AuthContext useEffect: getSession error:', error.message);
      }
      // --- Fim da depuração ---

      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
        });
        console.log('AuthContext useEffect: User set from getSession:', { id: session.user.id, email: session.user.email });
      } else {
        console.log('AuthContext useEffect: No session user found from getSession.');
      }
      setLoading(false);
      console.log('AuthContext useEffect: Loading set to false after getSession.');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // --- Adicionado para depuração ---
      console.log('AuthContext onAuthStateChange: Event and session:', _event, session);
      // --- Fim da depuração ---

      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
        });
        console.log('AuthContext onAuthStateChange: User set from session change:', { id: session.user.id, email: session.user.email });
        // AQUI REMOVEMOS O REDIRECIONAMENTO PROBLEMÁTICO
        // if (window.location.pathname !== '/chat') {
        //   navigate('/chat');
        // }
      } else {
        setUser(null);
        console.log('AuthContext onAuthStateChange: No session user found, clearing user.');
        if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
          console.log('AuthContext onAuthStateChange: Redirecting to /login.');
          navigate('/login');
        }
      }
    });

    return () => {
      console.log('AuthContext useEffect cleanup: Unsubscribing from auth state changes.');
      subscription.unsubscribe();
    };
  }, [navigate]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    console.log('AuthContext login: Attempting login...');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error || !data.user) {
      console.error('AuthContext login: Login error:', error?.message || 'No user data after login attempt.');
      throw new Error(error?.message || 'Erro ao fazer login');
    }
    setUser({
      id: data.user.id,
      email: data.user.email || '',
      full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
    });
    console.log('AuthContext login: User logged in:', { id: data.user.id, email: data.user.email });
  };

  const logout = async () => {
    setLoading(true);
    console.log('AuthContext logout: Attempting logout...');
    await supabase.auth.signOut();
    setLoading(false);
    console.log('AuthContext logout: User logged out.');
  };

  const register = async (email: string, password: string) => {
    setLoading(true);
    console.log('AuthContext register: Attempting registration...');
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      console.error('AuthContext register: Registration error:', error.message);
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
      console.log('AuthContext register: User registered and set:', { id: data.user.id, email: data.user.email });
    } else {
      console.warn('AuthContext register: No user data returned after signup, check email for confirmation.');
      throw new Error('Verifique seu e-mail para confirmar a criação da conta.');
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple', redirectTo?: string) => {
    setLoading(true);
    console.log(`AuthContext signInWithOAuth: Attempting login with ${provider}...`);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo || `${window.location.origin}/chat`,
      },
    });
    setLoading(false);
    if (error) {
      console.error(`AuthContext signInWithOAuth: OAuth error with ${provider}:`, error.message);
      throw new Error(error.message || `Erro ao fazer login com ${provider}`);
    }
    console.log(`AuthContext signInWithOAuth: OAuth initiated with ${provider}.`);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    register,
    signInWithOAuth,
  };

  // O spinner de carregamento no AuthProvider (opcional, pode ser removido se o ProtectedRoute o faz)
  if (loading) {
    console.log('AuthContext: Rendering loading spinner.');
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <p className="text-gray-700">Carregando autenticação...</p>
      </div>
    );
  }

  console.log('AuthContext: Rendering children. Current user:', user?.email);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}