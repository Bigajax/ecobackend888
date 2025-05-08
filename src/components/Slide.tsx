import React, { useRef, useEffect } from 'react';

interface GlassBubbleProps {
  color: string;
}

const GlassBubble: React.FC<GlassBubbleProps> = ({ color }) => {
  return (
    <div className="glass-bubble-container relative w-32 h-32 sm:w-40 sm:h-40 floating">
      {/* Main glass bubble */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, white 0%, ${color}10 30%, ${color}20 60%, ${color}30 100%)`,
          boxShadow: `0 4px 16px 0 rgba(31, 38, 135, 0.1),
                      inset 0 -5px 10px 0 ${color}20,
                      inset 0 5px 10px 0 rgba(255, 255, 255, 0.5)`,
          backdropFilter: 'blur(2px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          transform: 'scale(1)',
          transition: 'transform 0.3s ease-out',
        }}
      />

      {/* Highlight/reflection effect (menor e mais sutil) */}
      <div
        className="absolute w-2/5 h-1/5 rounded-full"
        style={{
          background: 'linear-gradient(120deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)',
          top: '15%',
          left: '15%',
          transform: 'rotate(-45deg)',
        }}
      />

      {/* Bottom shadow (mais suave) */}
      <div
        className="absolute bottom-0 left-1/2 w-1/2 h-2 rounded-full transform -translate-x-1/2 translate-y-5 opacity-30"
        style={{
          background: `radial-gradient(ellipse at center, ${color}50 0%, transparent 70%)`,
          filter: 'blur(2px)',
        }}
      />
    </div>
  );
};

interface SlideProps {
  title: string;
  text: string[];
  color: string;
  bubblePosition: string;
  background: string;
}

const Slide: React.FC<SlideProps> = ({
  title,
  text,
  color,
  bubblePosition,
  background,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!bubbleRef.current || !containerRef.current) return;

      const { left, top, width, height } = containerRef.current.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      const deltaX = (e.clientX - centerX) / (width / 20);
      const deltaY = (e.clientY - centerY) / (height / 20);

      bubbleRef.current.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1)`;
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex flex-col items-center justify-center transition-all duration-700 ease-in-out`}
      style={{ background, padding: '24px' }} // Adicionado padding ao redor do conteúdo
    >
      <h1 className="eco-title text-center relative z-10 mb-4 text-2xl font-semibold tracking-tight" style={{ color: '#333', opacity: 1 }}>{title}</h1> {/* Título menor */}

      <div ref={bubbleRef} className={`relative ${bubblePosition} z-0 my-6 transition-transform duration-300 ease-out`}>
        <GlassBubble color={color} />
      </div>

      <div className="text-container max-w-xl text-center relative z-10 mt-4" style={{ color: '#555', opacity: 1 }}>
        {text.map((line, index) => (
          <p
            key={index}
            className={`text-lg font-normal leading-relaxed mb-2 fade-in-delay-${index + 1}`} // Fonte mais leve
            style={{ color: '#666', opacity: 1 }}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
};

export default Slide;