import React, { useState } from 'react';
import Slide from './Slide';
import { slides } from "../date/slides";
import { Transition } from 'react-transition-group';

interface SequenceProps {
  currentStep: number;
  onClose: () => void;
}

const Sequence: React.FC<SequenceProps> = ({ onClose }) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const totalSlides = slides.length;

  const handleNext = () => {
    if (slideIndex < totalSlides - 1) {
      setSlideIndex(prevIndex => prevIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (slideIndex > 0) {
      setSlideIndex(prevIndex => prevIndex - 1);
    }
  };

  const goToSlide = (index: number) => {
    setSlideIndex(index);
  };

  return (
    <div className="sequence-container w-full h-full flex flex-col items-center justify-center overflow-hidden">
      <Transition
        in={true}
        timeout={300}
        mountOnEnter
        unmountOnExit
        key={slideIndex}
      >
        {(state) => (
          <div className={`absolute inset-0 w-full h-full flex items-center justify-center ${state}`}>
            {slides[slideIndex] && (
              <Slide
                {...slides[slideIndex]}
                onNext={handleNext} // Passamos as funções de navegação de volta para o Slide
                onPrev={handlePrev}
                isFirst={slideIndex === 0}
                isLast={slideIndex === totalSlides - 1}
              />
            )}
          </div>
        )}
      </Transition>

      {/* Indicadores de bolinhas */}
      <div className="absolute bottom-8 flex gap-2 z-10">
        {slides.map((_, index) => (
          <button
            key={index}
            className={`rounded-full w-3 h-3 transition-colors duration-300 ${
              index === slideIndex ? 'bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
            }`}
            onClick={() => goToSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Botão de fechar */}
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-sm z-10">
        Fechar
      </button>
    </div>
  );
};

export default Sequence;