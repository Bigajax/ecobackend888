// src/components/ProtectedRoute.tsx
import React, { useEffect } from 'react'; // Importe useEffect aqui
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth(); // <--- ONDE ESTÁ A MUDANÇA CRÍTICA

  // Adicione este useEffect para logar o estado de autenticação
  useEffect(() => {
    console.log("ProtectedRoute: Estado de autenticação - user:", user, "loading:", loading);
    if (!loading && !user) {
      console.log("ProtectedRoute: Condição de redirecionamento para /login ativada: !loading && !user.");
    }
  }, [user, loading]); // As dependências são user e loading para o log ser reavaliado quando eles mudam

  if (loading) {
    console.log("ProtectedRoute: Exibindo tela de carregamento...");
    // Exibe um spinner ou uma tela de carregamento enquanto a autenticação está sendo verificada.
    // Isso evita o redirecionamento para /login prematuramente.
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <p className="text-gray-700">Verificando autenticação...</p>
      </div>
    );
  }

  // Se não está carregando e o usuário NÃO está logado, redireciona.
  if (!user) {
    console.log("ProtectedRoute: Redirecionando para /login.");
    return <Navigate to="/login" />;
  }

  // Se não está carregando e o usuário ESTÁ logado, renderiza os filhos.
  console.log("ProtectedRoute: Usuário autenticado, renderizando filhos.");
  return <>{children}</>;
};

export default ProtectedRoute;