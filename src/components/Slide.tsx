// Arquivo: src/components/Slide.tsx (ou onde ele estiver)
import React, { useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import GlassBubble from './GlassBubble'; // Certifique-se que o caminho está correto

interface SlideProps {
    title: string;
    text: string[];
    // Remova 'color: string;' daqui também
    bubblePosition: string;
    background: string;
    onNext?: () => void;
    onPrev?: () => void;
    isFirst?: boolean;
    isLast?: boolean;
}

const Slide: React.FC<SlideProps> = ({
    title,
    text,
    // Remova 'color' daqui também
    bubblePosition,
    background,
    onNext,
    onPrev,
    isFirst,
    isLast,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // ... (restante do seu useEffect permanece o mesmo) ...
    }, []);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full flex flex-col items-center justify-center transition-all duration-700 ease-in-out relative`}
            style={{ background, padding: '24px', overflow: 'hidden' }}
        >
            <h1 className="eco-title text-center relative z-10 mb-4 text-2xl font-semibold tracking-tight" style={{ color: '#333', opacity: 1 }}>{title}</h1>

            <div
                ref={bubbleRef}
                className={`absolute ${bubblePosition} z-0 my-6 transition-transform duration-100 ease-out`}
                style={{ transformStyle: 'preserve-3d' }}
            >
                {/* Não passe a prop 'color' para GlassBubble */}
                <GlassBubble />
            </div>

            <div className="text-container max-w-xl text-center relative z-10 mt-4" style={{ color: '#555', opacity: 1 }}>
                {text.map((line, index) => (
                    <p
                        key={index}
                        className={`text-lg font-normal leading-relaxed mb-2 fade-in-delay-${index + 1}`}
                        style={{ color: '#666', opacity: 1 }}
                    >
                        {line}
                    </p>
                ))}
            </div>
            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center z-10">
                <div className="flex items-center gap-4">
                    {/* As setas e bolinhas serão renderizadas aqui */}
                </div>
            </div>
        </div>
    );
};

export default Slide;