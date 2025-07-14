// src/pages/LoginPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import PhoneFrame from '../components/PhoneFrame';
import Input from '../components/Input';
import TourInicial from '../components/TourInicial';
import EcoTitle from '../components/EcoTitle';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [isTourActive, setIsTourActive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/chat');
    }
  }, [user, navigate]);

  const handleIniciarTour = () => setIsTourActive(true);
  const handleCloseTour = () => setIsTourActive(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PhoneFrame>
      <div className="flex flex-col h-full px-6 py-8 justify-center items-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        {isTourActive && <TourInicial onClose={handleCloseTour} />}

        <div className="bg-white/20 backdrop-blur-lg border border-white/30 shadow-xl rounded-2xl px-8 py-10 w-full max-w-sm space-y-6">
          <EcoTitle />

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="rounded-lg border border-white/20 bg-white/10 backdrop-blur placeholder-white/50 text-gray-100 px-3 py-2 focus:ring-2 focus:ring-white/30 transition"
            />

            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="rounded-lg border border-white/20 bg-white/10 backdrop-blur placeholder-white/50 text-gray-100 px-3 py-2 focus:ring-2 focus:ring-white/30 transition"
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

            <div className="flex flex-col items-center space-y-3 w-full pt-2">
              <button
                type="submit"
                className="
                  w-full bg-white/60 backdrop-blur
                  border border-white/40
                  hover:bg-white/70
                  text-gray-800 font-semibold py-2.5 rounded-lg shadow-md
                  transform transition duration-300 ease-in-out
                  hover:scale-[1.02] active:scale-[0.98]
                  hover:brightness-105
                "
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <button
                type="button"
                className="
                  w-full bg-white/30 backdrop-blur
                  border border-white/40
                  hover:bg-white/40
                  text-gray-800 font-medium py-2.5 rounded-lg
                  transform transition duration-300 ease-in-out
                  hover:scale-[1.02] active:scale-[0.98]
                  hover:brightness-105
                "
                onClick={() => navigate('/register')}
                disabled={loading}
              >
                Criar perfil
              </button>

              <div className="border-b border-white/30 w-16 my-1" />
              <span className="text-gray-300 text-sm">ou</span>

              <button
                type="button"
                className="
                  w-full bg-white/30 backdrop-blur
                  border border-white/40
                  hover:bg-white/40
                  text-gray-800 font-medium py-2.5 rounded-lg
                  transform transition duration-300 ease-in-out
                  hover:scale-[1.02] active:scale-[0.98]
                  hover:brightness-105
                "
                onClick={handleIniciarTour}
                disabled={loading}
              >
                Iniciar Tour
              </button>
            </div>
          </form>
        </div>
      </div>
    </PhoneFrame>
  );
};

export default LoginPage;
