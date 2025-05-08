import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext'; // Importe o AuthProvider e useAuth
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import VoicePage from './pages/VoicePage';
import ProtectedRoute from './components/ProtectedRoute';
import TourInicial from './components/TourInicial'; // Importe o componente TourInicial

const App = () => {
    const [showLogin, setShowLogin] = useState(false);
    const [userInteracted, setUserInteracted] = useState(false);
    const { user, login, logout } = useAuth(); // Obtenha login e logout do contexto
    const navigate = useNavigate();

    // Função para lidar com o término da Tour
    const handleTourEnd = () => {
        // Após a Tour, o usuário vai para o Chat
        navigate('/chat');
    };

    // Função para ser chamada após a interação do usuário no Chat
    const handleUserChatInteraction = () => {
        setUserInteracted(true);
        setShowLogin(true); // Determina que o usuário deve ser redirecionado para o Login
    };

     useEffect(() => {
        // Se o usuário já está logado, vá para o chat
        if (user) {
            navigate('/chat');
        } else if (userInteracted) {
             navigate('/login');
        }
    }, [user, navigate, userInteracted]);

    return (
        <AuthProvider>
            <div className="h-screen w-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 font-sans">
                <Router>
                    <Routes>
                        <Route path="/" element={<LoginPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/tour" element={<TourInicial onClose={handleTourEnd} />} />
                        <Route
                            path="/chat"
                            element={user ? <ChatPage onUserInteract={handleUserChatInteraction}/> : <Navigate to="/login"/>} // Redireciona para login se não estiver logado
                        />
                        <Route
                            path="/voice"
                            element={
                                <ProtectedRoute>
                                    <VoicePage />
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </Router>
            </div>
        </AuthProvider>
    );
};

export default App;
