import React, { useState } from 'react';
import Slide from './Slide';
import { slides } from "../date/slides";
import { Transition } from 'react-transition-group';

interface SequenceProps {
  currentStep: number; // Recebe o currentStep inicial (agora não usado para navegação)
  onClose: () => void;
}

const Sequence: React.FC<SequenceProps> = ({ onClose }) => {
  const [slideIndex, setSlideIndex] = useState(0); // Inicia no primeiro slide
  const totalSlides = slides.length;

  const handleNext = () => {
    if (slideIndex < totalSlides - 1) {
      setSlideIndex(prevIndex => prevIndex + 1);
    } else {
      onClose(); // Chama a função onClose passada pelo TourInicial ao final
    }
  };

  const handlePrev = () => {
    if (slideIndex > 0) {
      setSlideIndex(prevIndex => prevIndex - 1);
    }
  };

  return (
    <div className="sequence-container w-full h-full flex items-center justify-center overflow-hidden">
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
                onNext={handleNext}
                onPrev={handlePrev}
                isFirst={slideIndex === 0}
                isLast={slideIndex === totalSlides - 1}
              />
            )}
          </div>
        )}
      </Transition>
    </div>
  );
};

export default Sequence;