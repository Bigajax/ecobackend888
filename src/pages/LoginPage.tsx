// src/pages/LoginPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import PhoneFrame from '../components/PhoneFrame';
import Input from '../components/Input';
import TourInicial from '../components/TourInicial';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signIn, user } = useAuth(); // substituído login por signIn
  const navigate = useNavigate();
  const [isTourActive, setIsTourActive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      console.log('[LoginPage] Usuário já autenticado, redirecionando para /chat');
      navigate('/chat');
    }
  }, [user, navigate]);

  const handleIniciarTour = () => {
    setIsTourActive(true);
  };

  const handleCloseTour = () => {
    setIsTourActive(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('[LoginPage] Tentando login com:', email);
      await signIn(email, password); // corrigido aqui também
      console.log('[LoginPage] Login bem-sucedido, aguardando redirecionamento pelo useEffect');
    } catch (err: any) {
      console.error('[LoginPage] Erro no login:', err.message || err);
      if (err.message?.includes('Database error granting user')) {
        setError('Erro interno ao conceder acesso. Tente novamente em instantes.');
      } else {
        setError(err.message || 'Falha na autenticação. Verifique suas credenciais.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PhoneFrame>
      <div className="flex flex-col h-full p-8 justify-center items-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 relative">
        {isTourActive && <TourInicial onClose={handleCloseTour} />}

        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl font-bold mb-2">ECO</h1>
          <p className="text-gray-500 text-sm">Espelho Emocional e Comportamental</p>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit(e);
            }}
          />

          {error && (
            <motion.p
              className="text-red-500 text-sm text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.p>
          )}

          <div className="pt-4 flex flex-col items-center space-y-2 w-full">
            <button
              type="submit"
              className="w-full bg-white text-black shadow-sm hover:bg-gray-100 font-semibold py-3 rounded-lg"
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <button
              type="button"
              className="w-full bg-white text-black shadow-sm hover:bg-gray-100 font-semibold py-3 rounded-lg"
              onClick={() => navigate('/register')}
              disabled={loading}
            >
              Criar perfil
            </button>

            <div className="border-b border-gray-300 w-16 my-2" />
            <span className="text-gray-500 text-sm">ou</span>

            <button
              type="button"
              className="w-full bg-white text-black shadow-sm hover:bg-gray-100 font-semibold py-3 rounded-lg"
              onClick={handleIniciarTour}
              disabled={loading}
            >
              Iniciar Tour
            </button>
          </div>
        </form>
      </div>
    </PhoneFrame>
  );
};

export default LoginPage;
