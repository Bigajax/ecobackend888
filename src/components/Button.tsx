import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface EcoBubbleProps {
    isListening: boolean;
    isProcessing: boolean;
    isEcoThinking: boolean;
    ecoAudioURL: string | null;
    setEcoAudioURL: (url: string | null) => void;
    size: string; // Adicionado para controlar o tamanho via Tailwind
    isAnimating: boolean; // Adicionado para controlar a vibração quando o áudio está tocando
}

// Componente interno da bolha 3D
const BubbleContent: React.FC<{
    isListening: boolean;
    isProcessing: boolean;
    isEcoThinking: boolean;
    audioPlaying: boolean; // Estado interno de reprodução de áudio
}> = ({ isListening, isProcessing, isEcoThinking, audioPlaying }) => {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame(({ clock }) => {
        if (meshRef.current) {
            const time = clock.getElapsedTime();
            let dynamicScale = 1;
            let rotationSpeed = 0.2;
            let vibrationIntensity = 0;

            // Lógica de escala baseada nos estados
            if (isListening) {
                dynamicScale = 1 + Math.sin(time * 5) * 0.05; // Pequena pulsação ao ouvir
            } else if (isProcessing || isEcoThinking) {
                dynamicScale = 1 + Math.sin(time * 8) * 0.1; // Pulsação mais forte ao pensar/processar
            } else if (audioPlaying) {
                dynamicScale = 1 + Math.sin(time * 15) * 0.15; // Pulsação mais rápida ao falar
                vibrationIntensity = 0.03; // Ativa a vibração ao falar
            }

            // Aplica a escala
            meshRef.current.scale.setScalar(dynamicScale);

            // Aplica a rotação
            meshRef.current.rotation.y = time * rotationSpeed;
            meshRef.current.rotation.x = time * rotationSpeed * 0.5;

            // Aplica a vibração se houver intensidade
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

// Componente principal EcoBubble que renderiza o Canvas
const EcoBubble: React.FC<EcoBubbleProps> = ({
    isListening,
    isProcessing,
    isEcoThinking,
    ecoAudioURL,
    setEcoAudioURL,
    size, // Usar a prop size
    isAnimating, // Usar a prop isAnimating para a vibração
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

    // Extrai o valor numérico do tamanho da prop 'size' (ex: "w-full h-full" ou "w-8 h-8")
    // Isso garante que o canvas tenha o tamanho correto em pixels.
    const widthMatch = size.match(/w-(\d+)/);
    const heightMatch = size.match(/h-(\d+)/);

    let canvasWidth = 400; // Default
    let canvasHeight = 400; // Default

    if (widthMatch && widthMatch[1] === 'full') {
        canvasWidth = window.innerWidth * 0.8; // Exemplo para 'w-full'
    } else if (widthMatch) {
        canvasWidth = parseInt(widthMatch[1]) * 4; // Tailwind default scale (1 unit = 4px)
    }

    if (heightMatch && heightMatch[1] === 'full') {
        canvasHeight = window.innerHeight * 0.8; // Exemplo para 'h-full'
    } else if (heightMatch) {
        canvasHeight = parseInt(heightMatch[1]) * 4;
    }

    // Garante que o canvas se ajuste ao tamanho da tela em tempo real
    useEffect(() => {
        const handleResize = () => {
            const canvas = document.getElementById('eco-bubble-canvas');
            if (canvas) {
                // Recalcula as dimensões com base na lógica acima
                const currentWidthMatch = size.match(/w-(\d+)/);
                const currentHeightMatch = size.match(/h-(\d+)/);

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
        handleResize(); // Define as dimensões iniciais

        return () => window.removeEventListener('resize', handleResize);
    }, [size]);


    return (
        <div className={`relative flex justify-center items-center ${size}`}>
            <Canvas
                id="eco-bubble-canvas" // Adiciona um ID para o canvas
                camera={{ position: [0, 0, 3], fov: 75 }}
                // O estilo agora é controlado pelo div pai e pelo useEffect para responsividade
            >
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} castShadow />
                <pointLight position={[-10, -10, -10]} />
                <BubbleContent
                    isListening={isListening}
                    isProcessing={isProcessing}
                    isEcoThinking={isEcoThinking}
                    audioPlaying={audioPlaying} // Passa o estado de reprodução de áudio
                />
                <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
                <Environment preset="sunset" background />
            </Canvas>
        </div>
    );
};

export default EcoBubble;