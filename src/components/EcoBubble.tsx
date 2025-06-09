// src/components/EcoBubble.tsx

import React, { useEffect, useRef } from 'react';
import { motion, useAnimation } from 'framer-motion';

interface EcoBubbleProps {
    isListening: boolean;
    isProcessing: boolean;
    isEcoThinking: boolean;
    ecoAudioURL: string | null;
    setEcoAudioURL: (url: string | null) => void;
    size?: string;
    isAnimating?: boolean;
}

const EcoBubble: React.FC<EcoBubbleProps> = ({
    isListening,
    isProcessing,
    isEcoThinking,
    ecoAudioURL,
    setEcoAudioURL,
    size = 'w-64 h-64',
    isAnimating = false
}) => {
    const controls = useAnimation();
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (ecoAudioURL) {
            const audio = new Audio(ecoAudioURL);
            audioRef.current = audio;
            audio.play().catch(err => console.warn("Erro ao tocar áudio:", err));
            audio.onended = () => {
                setEcoAudioURL(null);
            };
        }
    }, [ecoAudioURL, setEcoAudioURL]);

    useEffect(() => {
        if (isListening) {
            controls.start({
                scale: [1, 1.1, 1],
                transition: { duration: 1, repeat: Infinity },
            });
        } else if (isProcessing) {
            controls.start({
                rotate: [0, 360],
                boxShadow: '0 0 20px rgba(0, 123, 255, 0.6)',
                transition: { duration: 2, repeat: Infinity, ease: 'linear' },
            });
        } else if (isEcoThinking) {
            controls.start({
                scale: [1, 1.03, 1],
                transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            });
        } else {
            controls.stop();
        }
    }, [isListening, isProcessing, isEcoThinking, controls]);

    return (
        <motion.div
            animate={controls}
            className={`rounded-full ${size} relative`}
            style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(180,220,255,0.5))',
                border: '1px solid rgba(200, 220, 255, 0.5)',
                boxShadow: isAnimating
                    ? '0 0 30px rgba(50, 100, 255, 0.6)'
                    : '0 4px 20px rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
            }}
        />
    );
};

export default EcoBubble;
