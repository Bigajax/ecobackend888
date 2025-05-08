import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
    email: string;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    register: (email: string, password: string) => Promise<void>;
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
    const navigate = useNavigate();

    // Simulated authentication functions
    const login = useCallback(async (email: string, password: string) => {
        // In a real app, this would validate credentials with a backend
        if (email && password) {
            setUser({ email });
            navigate('/chat'); // Adicione esta linha para redirecionar após o login
        } else {
            throw new Error('Invalid credentials');
        }
    }, [navigate]);

    const logout = useCallback(() => {
        setUser(null);
        navigate('/login'); // Adicione esta linha para redirecionar após o logout
    }, [navigate]);

    const register = useCallback(async (email: string, password: string) => {
        // In a real app, this would create a new account in the backend
        if (email && password) {
            setUser({ email });
        } else {
            throw new Error('Invalid registration data');
        }
    }, []);

    const value = {
        user,
        login,
        logout,
        register,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
