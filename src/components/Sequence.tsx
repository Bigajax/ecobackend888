import React from 'react';
import Slide from './Slide';
import { slides } from "../date/slides";
import { Transition } from 'react-transition-group';

interface SequenceProps {
  currentStep: number; // Recebe o currentStep do TourInicial
}

const Sequence: React.FC<SequenceProps> = ({ currentStep }) => {
  // Ajusta o índice para corresponder ao array de slides
  const slideIndex = currentStep - 1;

  console.log('Renderizando Sequence com currentStep:', currentStep, 'e slideIndex:', slideIndex);
  console.log('Conteúdo de slides:', slides);

  if (slideIndex < 0 || slideIndex >= slides.length) {
    console.log('Índice de slide fora dos limites.');
    return null; // Ou renderize algo indicando um erro
  }

  const currentSlideData = slides[slideIndex];
  console.log('Dados do slide atual:', currentSlideData);

  return (
    <div className="sequence-container w-full h-full relative overflow-hidden">
      <Transition
        in={slideIndex >= 0 && slideIndex < slides.length}
        timeout={500}
        mountOnEnter
        unmountOnExit
      >
        {(state) => (
          <div className={`${state} w-full h-full`}>
            {currentSlideData && <Slide {...currentSlideData} />}
          </div>
        )}
      </Transition>
    </div>
  );
};

export default Sequence;