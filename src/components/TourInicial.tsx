import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassBubble from './GlassBubble';
import Sequence from './Sequence';
import Slide from './Slide';

interface TourInicialProps {
  onClose: () => void;
}

const TourInicial: React.FC<TourInicialProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    console.log('handleNext chamado');
    setCurrentStep((prevStep) => prevStep + 1);
  };

  const handlePrev = () => {
    setCurrentStep((prevStep) => prevStep - 1);
  };

  const handleEndTour = () => {
    onClose();
    navigate('/chat');
  };

  useEffect(() => {
    console.log('Renderizando TourInicial com currentStep:', currentStep);
  }, [currentStep]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Bem-vindo ao ECO!</h2>
            <p className="text-gray-700 mb-6">Explore uma breve introdução.</p>
            <div className="mb-8">
              <GlassBubble color="#a78bfa" />
            </div>
            <button onClick={handleNext} className="px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600">
              Próximo
            </button>
          </div>
        );
      case 1:
        return <Sequence currentStep={currentStep} />; // Passa currentStep como prop
      case 2:
        return (
          <Slide
            title="Pronto para Começar?"
            text={["Entre no espaço entre pensamentos.", "Sua presença cria o reflexo. Apenas seja."]}
            color="#00c698"
            bubblePosition="bottom-1/4 right-1/4"
            background="linear-gradient(to top left, #ccffbd, #f9feda)"
            onPrev={handlePrev}
            isLast={true}
            onNext={handleEndTour}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full h-full bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-md shadow-lg p-8 max-w-md w-full relative">
        {renderStep()}
        {currentStep > 0 && currentStep < 2 && (
          <button onClick={handlePrev} className="absolute top-4 left-4 text-gray-600 hover:text-gray-800">
            Anterior
          </button>
        )}
        {currentStep === 2 && (
          <button onClick={handleEndTour} className="w-full bg-green-500 text-white rounded-md py-2 hover:bg-green-600">
            Ir para o Chat
          </button>
        )}
        <button onClick={onClose} className="absolute bottom-4 right-4 text-gray-500 hover:text-gray-700 text-sm">
          Fechar Tour
        </button>
      </div>
    </div>
  );
};

export default TourInicial;