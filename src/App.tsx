// src/App.tsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import VoicePage from './pages/VoicePage';
import MemoryPage from './pages/MemoryPage';
import CreateProfilePage from './pages/CreateProfilePage';
import ProtectedRoute from './components/ProtectedRoute'; // Certifique-se que este componente existe e está correto

function App() {
  return (
    <div className="h-screen w-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 font-sans flex flex-col">
      <AuthProvider>
        <ChatProvider>
          <Routes>
            {/* Rota raiz (/) - removemos o Navigate to="/login" explícito aqui.
                A lógica do AuthContext e ProtectedRoute já lida com o redirecionamento
                para /login se o usuário não estiver autenticado, ou para /chat se estiver.
                Ainda assim, é boa prática ter uma rota inicial para o "ponto de entrada".
                Se a URL for apenas "/", e o usuário não estiver logado, o ProtectedRoute no /chat
                o levará para /login. Se ele já estiver logado, o AuthContext o levará para /chat.
                Podemos definir a rota "/" como sendo a LoginPage se o usuário não estiver logado.
             */}
            <Route path="/" element={<LoginPage />} /> {/* Define a raiz como LoginPage */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<CreateProfilePage />} />

            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/voice"
              element={
                <ProtectedRoute>
                  <VoicePage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/memory"
              element={
                <ProtectedRoute>
                  <MemoryPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </ChatProvider>
      </AuthProvider>
    </div>
  );
}

export default App;