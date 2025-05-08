import React from 'react';
import Slide from './Slide';
import { slides } from "../date/slides";

interface SequenceProps {
  currentStep: number; // Recebe o currentStep do TourInicial
}

const Sequence: React.FC<SequenceProps> = ({ currentStep }) => {
  // Ajusta o índice para corresponder ao array de slides
  const slideIndex = currentStep - 1;

  // Garante que o índice esteja dentro dos limites do array
  if (slideIndex < 0 || slideIndex >= slides.length) {
    return null; // Ou renderize algo indicando um erro
  }

  return (
    <div className="sequence-container w-full h-full relative overflow-hidden">
      <Slide {...slides[slideIndex]} />
    </div>
  );
};

export default Sequence;