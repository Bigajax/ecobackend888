import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import PhoneFrame from '../components/PhoneFrame';
import Input from '../components/Input';
import Button from '../components/Button';
import TourInicial from '../components/TourInicial';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [isTourActive, setIsTourActive] = useState(false);

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

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate('/chat');
    } catch (err) {
      setError('Falha na autenticação. Verifique suas credenciais.');
    }
  };

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
              className="bg-white text-black shadow-sm hover:bg-gray-100 font-semibold py-3 rounded-lg"
            >
              Entrar
            </Button>
            <button
              type="button"
              className="text-gray-600 hover:text-gray-800 text-sm underline"
              onClick={() => setIsLogin(false)}
            >
              Criar perfil
            </button>
            <div className="border-b border-gray-300 w-16 my-2" />
            <span className="text-gray-500 text-sm">ou</span>
            <Button
              type="button"
              fullWidth
              onClick={handleIniciarTour}
              className="bg-white text-black shadow-sm hover:bg-gray-100 font-semibold py-3 rounded-lg"
            >
              Iniciar Tour
            </Button>
          </div>
        </form>

        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <button
            className="text-gray-600 hover:text-gray-800 text-sm underline"
            onClick={() => setIsLogin(true)}
          >
            Já possui uma conta? Entrar
          </button>
        </motion.div>
      </div>
    </PhoneFrame>
  );
};

export default LoginPage;