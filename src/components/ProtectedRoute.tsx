import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { user } = useAuth();
    const navigate = useNavigate(); // Utilize useNavigate para redirecionar

    if (!user) {
        return <Navigate to="/login" replace />; // Use Navigate e adicione replace
    }

    return <>{children}</>;
};

export default ProtectedRoute;
