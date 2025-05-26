import React from 'react';

interface EcoBubbleProps {
    isAnimating?: boolean; // Prop para controlar a animação de vibração
    size?: string; // Para controlar o tamanho da bolha (ex: 'w-16 h-16')
}

const EcoBubble: React.FC<EcoBubbleProps> = ({ isAnimating = false, size = 'w-16 h-16' }) => {
    const orbBaseColor = '#7A9EBF'; // Cor base da bolha, vinda da landing page

    return (
        <div className={`relative ${size} ${isAnimating ? 'vibrating' : 'floating'}`}>
            {/* Main glass bubble */}
            <div
                className="absolute inset-0 rounded-full"
                style={{
                    background: `radial-gradient(circle at 30% 30%, white 0%, ${orbBaseColor}10 30%, ${orbBaseColor}20 60%, ${orbBaseColor}30 100%)`,
                    boxShadow: `0 8px 32px 0 rgba(31, 38, 135, 0.2),
                                inset 0 -10px 20px 0 ${orbBaseColor}30,
                                inset 0 10px 20px 0 rgba(255, 255, 255, 0.7)`,
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    transform: 'scale(1)',
                    transition: 'transform 0.3s ease-out',
                }}
            />

            {/* Bottom shadow (opcional, pode remover se não ficar bom em tamanho pequeno) */}
            <div
                className="absolute bottom-0 left-1/2 w-3/4 h-2 rounded-full transform -translate-x-1/2 translate-y-4 opacity-40" // Ajustes para tamanho menor
                style={{
                    background: `radial-gradient(ellipse at center, ${orbBaseColor}80 0%, transparent 70%)`,
                    filter: 'blur(2px)', // Ajuste do blur
                }}
            />

            {/* Pulse animation (mantido para um efeito sutil) */}
            <div
                className="absolute inset-0 rounded-full"
                style={{
                    border: `1px solid ${orbBaseColor}30`,
                    animation: 'pulse 2s infinite',
                }}
            />
        </div>
    );
};

export default EcoBubble;