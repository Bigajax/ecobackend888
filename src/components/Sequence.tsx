import React, { useState, useEffect } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import Slide from './Slide';
import { slides } from "../../date/slides";

const Sequence: React.FC = () => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (autoPlay) {
      timer = setTimeout(() => {
        if (currentSlideIndex < slides.length - 1) {
          setCurrentSlideIndex(currentSlideIndex + 1);
        } else {
          // Optional: loop back to the beginning
          // setCurrentSlideIndex(0);
        }
      }, 6000); // Change slide every 6 seconds
    }
    
    return () => {
      clearTimeout(timer);
    };
  }, [currentSlideIndex, autoPlay]);

  const goToNextSlide = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
      setAutoPlay(false); // Pause autoplay when manually navigating
    }
  };

  const goToPrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
      setAutoPlay(false); // Pause autoplay when manually navigating
    }
  };

  return (
    <div className="sequence-container w-full h-full relative overflow-hidden">
      <TransitionGroup component={null}>
        <CSSTransition
          key={currentSlideIndex}
          timeout={500}
          classNames="slide"
        >
          <Slide 
            {...slides[currentSlideIndex]} 
            onNext={goToNextSlide} 
            onPrev={goToPrevSlide} 
            isFirst={currentSlideIndex === 0}
            isLast={currentSlideIndex === slides.length - 1}
          />
        </CSSTransition>
      </TransitionGroup>
      
      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentSlideIndex ? 'bg-gray-800 w-4' : 'bg-gray-400'
            }`}
            onClick={() => {
              setCurrentSlideIndex(index);
              setAutoPlay(false);
            }}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default Sequence;