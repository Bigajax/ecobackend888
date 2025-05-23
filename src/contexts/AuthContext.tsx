import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface User {
  id: string;
  email: string;
  // Adicione outras propriedades do usuário que você usa, se houver
  // ex: full_name?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'apple', redirectTo?: string) => Promise<void>; // <-- Adicionado
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
  const [loading, setLoading] = useState(true); // Adicionado estado de loading
  const navigate = useNavigate();

  // Monitora se o usuário já estava logado (persistência) e mudanças de estado
  useEffect(() => {
    // Busca a sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
        });
      }
      setLoading(false); // Define loading como false após tentar obter a sessão inicial
    });

    // Monitora mudanças de estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
        });
        // Se a sessão foi restaurada ou um novo login ocorreu, e não estamos na página de chat,
        // redirecione para o chat. Isso é útil para o fluxo OAuth.
        if (window.location.pathname !== '/chat') {
          navigate('/chat');
        }
      } else {
        setUser(null);
        // Se não há usuário logado e não estamos nas páginas de login/registro, redirecione para o login.
        if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
          navigate('/login');
        }
      }
      setLoading(false); // Define loading como false após cada mudança de estado
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]); // Adicionado navigate como dependência

  const login = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error || !data.user) throw new Error('Erro ao fazer login');
    setUser({
      id: data.user.id,
      email: data.user.email || '',
    });
    // O redirecionamento para /chat já está sendo tratado no useEffect via onAuthStateChange
    // para unificar o tratamento de todos os tipos de login.
  };

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
    // setUser(null) e navigate('/login') já são tratados pelo onAuthStateChange
  };

  const register = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
        // Se o erro for sobre e-mail já registrado, você pode tratar diferente
        if (error.message.includes('User already registered')) {
            throw new Error('Este e-mail já está registrado. Tente fazer login.');
        }
        throw new Error(error.message || 'Erro ao criar conta');
    }
    // No caso de `signUp`, o Supabase pode exigir confirmação de e-mail.
    // O `data.user` pode ser null ou o usuário pode estar em estado "Awaiting Email Confirmation".
    // A gestão da sessão (setUser, navigate) para `signUp` é melhor deixar no componente `CreateProfilePage`
    // para tratar o caso de confirmação de e-mail ou, no `onAuthStateChange` se o fluxo for direto.
    // Por enquanto, vamos manter o `setUser` aqui se houver um usuário válido imediatamente.
    if (data.user) {
        setUser({
            id: data.user.id,
            email: data.user.email || '',
        });
        // O redirecionamento para /chat já é tratado no useEffect via onAuthStateChange
    } else {
        // Se não há data.user, pode significar que um e-mail de confirmação foi enviado.
        // O componente chamador (CreateProfilePage) deve lidar com esta mensagem.
        throw new Error('Verifique seu e-mail para confirmar a criação da conta.');
    }
  };

  // Nova função para login social
  const signInWithOAuth = async (provider: 'google' | 'apple', redirectTo?: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo || `${window.location.origin}/chat`, // Redireciona para /chat por padrão
      },
    });
    setLoading(false);
    if (error) throw new Error(error.message || `Erro ao fazer login com ${provider}`);
    // O onAuthStateChange no useEffect capturará a sessão quando o usuário for redirecionado de volta.
  };

  const value = {
    user,
    login,
    logout,
    register,
    signInWithOAuth, // <-- Adicionado ao valor do contexto
  };

  // Opcional: Adicione um componente de carregamento enquanto a autenticação inicial está sendo verificada
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <p className="text-gray-700">Carregando autenticação...</p>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}