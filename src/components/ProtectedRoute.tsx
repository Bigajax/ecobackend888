// src/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Certifique-se de importar useAuth corretamente

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth(); // <--- ONDE ESTÁ A MUDANÇA CRÍTICA

  if (loading) {
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
    return <Navigate to="/login" />;
  }

  // Se não está carregando e o usuário ESTÁ logado, renderiza os filhos.
  return <>{children}</>;
};

export default ProtectedRoute;