import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import PhoneFrame from '../components/PhoneFrame';
import Input from '../components/Input';
import Button from '../components/Button';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const { login, register } = useAuth();
  const navigate = useNavigate();

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

  return (
    <PhoneFrame>
      <div className="flex flex-col h-full p-8 justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl font-bold mb-2">ECO</h1>
          <p className="text-gray-500 text-sm">Espelho Emocional e Comportamental</p>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          
          <div className="pt-4">
            <Button type="submit" fullWidth>
              {isLogin ? 'Entrar' : 'Criar perfil'}
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
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Criar perfil' : 'Já possui uma conta? Entrar'}
          </button>
        </motion.div>
      </div>
    </PhoneFrame>
  );
};

export default LoginPage;