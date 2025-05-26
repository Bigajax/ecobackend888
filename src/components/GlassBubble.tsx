// Arquivo: src/components/GlassBubble.tsx (ou onde ele estiver)

import React from 'react';

interface GlassBubbleProps {
    // Remova a prop 'color' se ela não for mais necessária
    // color: string;
}

// Defina a cor fixa aqui
const FIXED_BUBBLE_COLOR = '#007BFF'; // Exemplo de azul. Você pode escolher qualquer cor HEX ou nome de cor CSS

const GlassBubble: React.FC<GlassBubbleProps> = () => { // Remova '{ color }' dos parâmetros
    return (
        <div className="glass-bubble-container relative w-48 h-48 sm:w-64 sm:h-64 floating">
            {/* Main glass bubble - Base da bolha de vidro */}
            <div
                className="absolute inset-0 rounded-full"
                style={{
                    // Use a cor fixa diretamente aqui
                    background: `radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.9) 0%, ${FIXED_BUBBLE_COLOR}10 25%, ${FIXED_BUBBLE_COLOR}20 50%, ${FIXED_BUBBLE_COLOR}30 100%)`,
                    boxShadow: `
                        0 8px 32px 0 rgba(31, 38, 135, 0.2),
                        inset 0 -10px 20px 0 ${FIXED_BUBBLE_COLOR}30,
                        inset 0 10px 20px 0 rgba(255, 255, 255, 0.7)
                    `,
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    transform: 'scale(1)',
                    transition: 'transform 0.3s ease-out',
                }}
            />

            {/* Reflection/Highlight 1 - Reflexo principal, maior e mais difuso */}
            <div
                className="absolute w-3/5 h-1/4 rounded-full"
                style={{
                    background: 'linear-gradient(120deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)',
                    top: '20%',
                    left: '20%',
                    transform: 'rotate(-45deg)',
                    filter: 'blur(1px)',
                }}
            />

            {/* Reflection/Highlight 2 - Reflexo menor e mais pontual, para um brilho extra */}
            <div
                className="absolute w-1/5 h-1/10 rounded-full"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%)',
                    top: '10%',
                    left: '65%',
                    filter: 'blur(0.5px)',
                    transform: 'rotate(15deg)'
                }}
            />

            {/* Bottom shadow - Sombra projetada no "chão" */}
            <div
                className="absolute bottom-0 left-1/2 w-3/4 h-4 rounded-full transform -translate-x-1/2 translate-y-10 opacity-40"
                style={{
                    // Use a cor fixa aqui
                    background: `radial-gradient(ellipse at center, ${FIXED_BUBBLE_COLOR}80 0%, transparent 70%)`,
                    filter: 'blur(4px)',
                }}
            />

            {/* Inner light effect - Efeito de luz interna suave, bem no centro da bolha */}
            <div
                className="absolute inset-0 rounded-full"
                style={{
                    // Use a cor fixa aqui
                    background: `radial-gradient(circle at center, ${FIXED_BUBBLE_COLOR}10 0%, transparent 70%)`,
                    filter: 'blur(5px)',
                }}
            />
        </div>
    );
};

export default GlassBubble;