// src/components/EcoBubble.tsx

import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface EcoBubbleProps {
    isListening?: boolean;
    isProcessing?: boolean;
    isEcoThinking?: boolean;
    ecoAudioURL?: string | null;
    setEcoAudioURL?: (url: string | null) => void;
    size?: string;
    isAnimating?: boolean;
}

// ... (BubbleContent permanece o mesmo) ...
const BubbleContent: React.FC<{
    isListening: boolean;
    isProcessing: boolean;
    isEcoThinking: boolean;
    audioPlaying: boolean;
}> = ({ isListening, isProcessing, isEcoThinking, audioPlaying }) => {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame(({ clock }) => {
        if (meshRef.current) {
            const time = clock.getElapsedTime();
            let dynamicScale = 1;
            let rotationSpeed = 0.2;
            let vibrationIntensity = 0;

            if (isListening) {
                dynamicScale = 1 + Math.sin(time * 5) * 0.05;
            } else if (isProcessing || isEcoThinking) {
                dynamicScale = 1 + Math.sin(time * 8) * 0.1;
            } else if (audioPlaying) {
                dynamicScale = 1 + Math.sin(time * 15) * 0.15;
                vibrationIntensity = 0.03;
            }

            meshRef.current.scale.setScalar(dynamicScale);
            meshRef.current.rotation.y = time * rotationSpeed;
            meshRef.current.rotation.x = time * rotationSpeed * 0.5;

            if (vibrationIntensity > 0) {
                meshRef.current.position.x = Math.sin(time * 30) * vibrationIntensity;
                meshRef.current.position.y = Math.cos(time * 35) * vibrationIntensity;
            } else {
                meshRef.current.position.x = 0;
                meshRef.current.position.y = 0;
            }
        }
    });

    return (
        <mesh ref={meshRef}>
            <sphereGeometry args={[1, 64, 64]} />
            <meshPhysicalMaterial
                color={new THREE.Color(0x87CEEB)}
                transparent
                opacity={0.7}
                roughness={0.2}
                metalness={0.0}
                transmission={0.9}
                thickness={0.5}
                envMapIntensity={0.8}
            />
        </mesh>
    );
};


const EcoBubble: React.FC<EcoBubbleProps> = ({
    isListening = false,
    isProcessing = false,
    isEcoThinking = false,
    ecoAudioURL = null,
    setEcoAudioURL = () => {},
    // --- ALTERAÇÃO AQUI: Garante que 'size' seja sempre uma string válida ---
    size = "w-40 h-40",
    isAnimating = false,
}) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioPlaying, setAudioPlaying] = useState(false);

    useEffect(() => {
        if (ecoAudioURL) {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = ecoAudioURL;
            } else {
                audioRef.current = new Audio(ecoAudioURL);
            }
            audioRef.current.onended = () => {
                setAudioPlaying(false);
                setEcoAudioURL(null);
                if (audioRef.current) {
                    audioRef.current.removeAttribute('src');
                }
            };
            audioRef.current.play().then(() => {
                setAudioPlaying(true);
            }).catch(e => console.error("Erro ao tentar reproduzir áudio da Eco na bolha:", e));
        }
    }, [ecoAudioURL, setEcoAudioURL]);

    // --- ALTERAÇÃO AQUI: Adiciona fallback para 'size' antes de chamar .match() ---
    const safeSize = size || "w-40 h-40"; // Garante que safeSize seja uma string mesmo se 'size' for undefined/null
    const widthMatch = safeSize.match(/w-(\d+)/);
    const heightMatch = safeSize.match(/h-(\d+)/);

    let canvasWidth = 400; // Default
    let canvasHeight = 400; // Default

    if (widthMatch && widthMatch[1] === 'full') {
        canvasWidth = window.innerWidth * 0.8;
    } else if (widthMatch) {
        canvasWidth = parseInt(widthMatch[1]) * 4;
    }

    if (heightMatch && heightMatch[1] === 'full') {
        canvasHeight = window.innerHeight * 0.8;
    } else if (heightMatch) {
        canvasHeight = parseInt(heightMatch[1]) * 4;
    }

    useEffect(() => {
        const handleResize = () => {
            const canvas = document.getElementById('eco-bubble-canvas');
            if (canvas) {
                const currentSafeSize = size || "w-40 h-40"; // Também usa safeSize aqui
                const currentWidthMatch = currentSafeSize.match(/w-(\d+)/);
                const currentHeightMatch = currentSafeSize.match(/h-(\d+)/);

                let currentCanvasWidth = 400;
                let currentCanvasHeight = 400;

                if (currentWidthMatch && currentWidthMatch[1] === 'full') {
                    currentCanvasWidth = window.innerWidth * 0.8;
                } else if (currentWidthMatch) {
                    currentCanvasWidth = parseInt(currentWidthMatch[1]) * 4;
                }

                if (currentHeightMatch && currentHeightMatch[1] === 'full') {
                    currentCanvasHeight = window.innerHeight * 0.8;
                } else if (currentHeightMatch) {
                    currentCanvasHeight = parseInt(currentHeightMatch[1]) * 4;
                }

                (canvas as HTMLCanvasElement).width = currentCanvasWidth;
                (canvas as HTMLCanvasElement).height = currentCanvasHeight;
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [size]);


    return (
        <div className={`relative flex justify-center items-center ${size}`}>
            <Canvas
                id="eco-bubble-canvas"
                camera={{ position: [0, 0, 3], fov: 75 }}
            >
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} castShadow />
                <pointLight position={[-10, -10, -10]} />
                <BubbleContent
                    isListening={isListening}
                    isProcessing={isProcessing}
                    isEcoThinking={isEcoThinking}
                    audioPlaying={audioPlaying}
                />
                <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
                <Environment preset="sunset" />
            </Canvas>
        </div>
    );
};

export default EcoBubble;