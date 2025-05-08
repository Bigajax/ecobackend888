import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassBubble from './GlassBubble';
import Sequence from './Sequence';

interface TourInicialProps {
  onClose: () => void;
}

const TourInicial: React.FC<TourInicialProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [showSequence, setShowSequence] = useState(false);

  const handleIniciarSequence = () => {
    setShowSequence(true);
  };

  const handleSequenceClosed = () => {
    onClose();
    navigate('/chat');
  };

  return (
    <div className="fixed top-0 left-0 w-full h-full bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-md shadow-lg p-8 max-w-md w-full relative">
        {!showSequence ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Bem-vindo ao ECO!</h2>
            <p className="text-gray-700 mb-6">Explore uma breve introdução.</p>
            <div className="mb-8">
              <GlassBubble color="#a78bfa" />
            </div>
            <button onClick={handleIniciarSequence} className="px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600">
              Próximo
            </button>
          </div>
        ) : (
          <Sequence onClose={handleSequenceClosed} />
        )}
        <button onClick={onClose} className="absolute bottom-4 right-4 text-gray-500 hover:text-gray-700 text-sm">
          Fechar Tour
        </button>
      </div>
    </div>
  );
};

export default TourInicial;