// src/pages/CreateProfilePage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import PhoneFrame from '../components/PhoneFrame';
import Input from '../components/Input';
import Button from '../components/Button';

const CreateProfilePage: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: authError } = await register(email, password);

      if (authError) {
        throw authError;
      }

      if (data && data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            { id: data.user.id, full_name: fullName }
          ]);

        if (profileError) {
          throw profileError;
        }

        console.log('Usuário registrado e perfil criado:', data.user);
        navigate('/chat');
      } else {
        setError('Conta criada, mas verifique seu e-mail para confirmar a conta.');
      }

    } catch (err: any) {
      console.error('Erro ao criar perfil:', err);
      setError(err.message || 'Falha ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PhoneFrame>
      <div className="flex flex-col h-full p-8 justify-center items-center relative"> {/* Removi o bg-gradient-* daqui */}
        <motion.div
          // Removi bg-white/70 e backdrop-blur-md
          className="p-8 rounded-2xl shadow-xl max-w-sm w-full text-center" 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-semibold text-gray-800 mb-2">Criar Perfil</h1>
          <p className="text-sm text-gray-600 mb-8">Espelho Emocional e Comportamental</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="Nome completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
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
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirmar senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
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

            {/* As classes do botão serão sobrescritas pelo 'Button.tsx' que agora tem os estilos Apple como padrão para 'primary'. */}
            {/* O 'text-black' foi adicionado explicitamente para garantir a cor do texto no botão branco. */}
            <Button type="submit" fullWidth disabled={loading} className="text-black bg-white hover:bg-gray-100">
              {loading ? 'Criando...' : 'Criar Conta'}
            </Button>
          </form>

          <motion.div
            className="mt-6 text-center text-sm text-gray-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Já possui uma conta? {' '}
            <button
              type="button"
              className="text-gray-800 font-medium underline hover:text-gray-900"
              onClick={() => navigate('/')}
            >
              Entrar
            </button>
          </motion.div>
        </motion.div>
      </div>
    </PhoneFrame>
  );
};

export default CreateProfilePage;