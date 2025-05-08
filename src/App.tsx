import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import VoicePage from './pages/VoicePage';
import ProtectedRoute from './components/ProtectedRoute';
import TourInicial from './components/TourInicial'; // Importe o componente TourInicial

// Define o tipo para o contexto de autenticação
interface AuthContextProps {
    user: any | null; // Defina um tipo mais específico para 'user' se possível
    signIn: () => void; // Adicione a função signIn
    signOut: () => void; // Adicione a função signOut
}

// Cria o contexto de autenticação
const AuthContext = createContext<AuthContextProps | undefined>(undefined);

// Hook personalizado para usar o contexto de autenticação
const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};

// Provedor de autenticação
const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<any | null>(null); // Inicializa o estado do usuário
    const navigate = useNavigate();

    // Simula o login
    const signIn = () => {
        // Lógica de autenticação (simulada aqui)
        setUser({ id: 'user123', name: 'Usuário Teste' }); // Define um usuário simulado
        navigate('/chat'); // Redireciona para o chat após o login
    };

    // Simula o logout
    const signOut = () => {
        setUser(null); // Limpa o estado do usuário
        navigate('/login'); // Redireciona para o login após o logout
    };

    // Verifica se há um usuário logado ao carregar o componente
    useEffect(() => {
        // Tente obter o usuário do localStorage ou de onde você o estiver armazenando
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
                // Se o usuário estiver logado, redirecione para o chat ou outra página
                navigate('/chat'); // Redirecionar para a página apropriada após o login
            } catch (error) {
                console.error("Failed to parse user from localStorage", error);
                // Se houver um erro ao analisar o JSON, remova a entrada inválida
                localStorage.removeItem('user');
            }
        }
    }, [navigate]);

    // Salva o usuário no localStorage sempre que ele muda
    useEffect(() => {
        if (user) {
            localStorage.setItem('user', JSON.stringify(user));
        } else {
            localStorage.removeItem('user');
        }
    }, [user]);

    const authContextValue = {
        user,
        signIn,
        signOut,
    };

    return (
        <AuthContext.Provider value={authContextValue}>
            {children}
        </AuthContext.Provider>
    );
};

const App = () => {
    const [showLogin, setShowLogin] = useState(false);
    const [userInteracted, setUserInteracted] = useState(false);
    const { user } = useAuth();
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
