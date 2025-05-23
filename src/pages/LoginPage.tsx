import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import PhoneFrame from '../components/PhoneFrame';
import Input from '../components/Input';
import Button from '../components/Button';
import TourInicial from '../components/TourInicial';
// Ícones do Google e Apple não são mais necessários
// import { FcGoogle } from 'react-icons/fc';
// import { FaApple } from 'react-icons/fa';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth(); // signInWithOAuth não é mais necessário aqui
  const navigate = useNavigate();
  const [isTourActive, setIsTourActive] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleIniciarTour = () => {
    console.log('handleIniciarTour chamado');
    setIsTourActive(true);
    console.log('isTourActive agora é:', isTourActive);
  };

  const handleCloseTour = () => {
    console.log('handleCloseTour chamado');
    setIsTourActive(false);
    console.log('isTourActive agora é:', isTourActive);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      // O navigate para /chat é tratado no AuthContext via onAuthStateChange
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  // As funções de login social não são mais necessárias
  // const handleSocialLogin = async (provider: 'google' | 'apple') => {
  //   setError('');
  //   setLoading(true);
  //   try {
  //     await signInWithOAuth(provider, `${window.location.origin}/chat`);
  //   } catch (err: any) {
  //     setError(err.message || `Falha ao fazer login com ${provider}.`);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  console.log('Renderizando LoginPage com isTourActive:', isTourActive);

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
            <Button
              type="submit"
              fullWidth
              disabled={loading}
              className="bg-white text-black shadow-sm hover:bg-gray-100 font-semibold py-3 rounded-lg"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
            <button
              type="button"
              className="text-gray-600 hover:text-gray-800 text-sm underline"
              onClick={() => navigate('/register')}
            >
              Criar perfil
            </button>
            <div className="border-b border-gray-300 w-16 my-2" />
            <span className="text-gray-500 text-sm">ou</span>
            <Button
              type="button"
              fullWidth
              onClick={handleIniciarTour}
              disabled={loading}
              className="bg-white text-black shadow-sm hover:bg-gray-100 font-semibold py-3 rounded-lg"
            >
              Iniciar Tour
            </Button>
          </div>
        </form>

        {/* Os botões de login social foram removidos daqui */}
        {/* <div className="mt-8 w-full max-w-sm flex justify-center space-x-4">
          <Button
            type="button"
            onClick={() => handleSocialLogin('google')}
            disabled={loading}
            className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100 transition-colors duration-200"
          >
            {loading ? (
              <span className="text-gray-700 text-xs">...</span>
            ) : (
              <FcGoogle className="h-8 w-8" />
            )}
          </Button>

          <Button
            type="button"
            onClick={() => handleSocialLogin('apple')}
            disabled={loading}
            className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100 transition-colors duration-200"
          >
            {loading ? (
              <span className="text-gray-700 text-xs">...</span>
            ) : (
              <FaApple className="h-8 w-8 text-gray-700" />
            )}
          </Button>
        </div> */}
      </div>
    </PhoneFrame>
  );
};

export default LoginPage;