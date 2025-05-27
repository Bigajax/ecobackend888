// src/App.tsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import VoicePage from './pages/VoicePage'; // DESCOMENTADO/ADICIONADO DE VOLTA
import MemoryPage from './pages/MemoryPage';
import CreateProfilePage from './pages/CreateProfilePage';
import ProtectedRoute from './components/ProtectedRoute';

// REMOVIDO/COMENTADO: O componente de teste SuperSimpleVoiceTestPage não é mais necessário aqui.
/*
const SuperSimpleVoiceTestPage: React.FC = () => {
  console.log("!!! SuperSimpleVoiceTestPage RENDERIZADO E VISÍVEL !!!");
  useEffect(() => {
    return () => {
      console.log("!!! SuperSimpleVoiceTestPage DESMONTADO !!!");
    };
  }, []);
  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      backgroundColor: 'darkblue',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontSize: '50px',
      color: 'lime',
      zIndex: 9999
    }}>
      MODO DE VOZ ATIVADO!
    </div>
  );
};
*/
// FIM DO COMPONENTE DE TESTE REMOVIDO/COMENTADO

function App() {
  return (
    <div className="h-screen w-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 font-sans flex flex-col">
      <AuthProvider>
        <ChatProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
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

            {/* AQUI: A rota /voice agora renderiza VoicePage original dentro de ProtectedRoute */}
            <Route
              path="/voice"
              element={
                <ProtectedRoute>
                  <VoicePage /> {/* VoicePage original está de volta aqui! */}
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