import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Slide from './Slide';
import { slides } from "../date/slides";
import { Transition } from 'react-transition-group';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';

interface SequenceProps {
    currentStep: number;
    onClose: () => void;
}

const Sequence: React.FC<SequenceProps> = ({ onClose }) => {
    const [slideIndex, setSlideIndex] = useState(0);
    const totalSlides = slides.length;
    const navigate = useNavigate();

    const handleNext = () => {
        if (slideIndex < totalSlides - 1) {
            setSlideIndex(prevIndex => prevIndex + 1);
        } else {
            navigate('/chat');
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
                                onNext={handleNext}
                                onPrev={handlePrev}
                                isFirst={slideIndex === 0}
                                isLast={slideIndex === totalSlides - 1}
                            />
                        )}
                    </div>
                )}
            </Transition>

            {/* Container para setas e bolinhas */}
            <div className="absolute bottom-12 flex justify-center items-center gap-4 z-10">
                {slideIndex > 0 && (
                    <button
                        onClick={handlePrev}
                        className="p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all"
                        aria-label="Previous slide"
                    >
                        <ArrowLeft size={20} className="text-gray-600 opacity-70" />
                    </button>
                )}

                {/* Indicadores de bolinhas */}
                <div className="flex gap-2">
                    {slides.map((_, index) => (
                        <button
                            key={index}
                            className={`rounded-full w-3 h-3 transition-colors duration-300 ${index === slideIndex ? 'bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
                                }`}
                            onClick={() => goToSlide(index)}
                            aria-label={`Go to slide ${index + 1}`}
                        />
                    ))}
                </div>

                {slideIndex < totalSlides - 1 && (
                    <button
                        onClick={handleNext}
                        className="p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all"
                        aria-label="Next slide"
                    >
                         <ArrowRight size={20} className="text-gray-600 opacity-70" />
                    </button>
                )}

                {slideIndex === totalSlides - 1 && (
                    <button
                        onClick={handleNext}
                        className="px-6 py-3 bg-white/20 text-black rounded-full hover:bg-white/30 transition-colors duration-300
                                   border border-gray-300 shadow-md" // Estilo mais próximo do design da Apple
                        aria-label="Go to Chat"
                    >
                        Ir para o Chat
                    </button>
                )}
            </div>

            {/* Botão de fechar (ícone de X) */}
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-sm z-10">
                <X size={20} />
            </button>
        </div>
    );
};

export default Sequence;
