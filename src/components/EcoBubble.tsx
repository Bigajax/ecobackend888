// src/components/EcoBubble.tsx
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
}

const Bubble: React.FC<EcoBubbleProps> = ({ isListening, isProcessing, isEcoThinking, ecoAudioURL, setEcoAudioURL }) => {
    const meshRef = useRef<THREE.Mesh>(null);
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

    useFrame(({ clock }) => {
        if (meshRef.current) {
            const time = clock.getElapsedTime();
            const scaleFactor = 1;
            let dynamicScale = 1;

            if (isListening) {
                dynamicScale = 1 + Math.sin(time * 5) * 0.05;
            } else if (isProcessing || isEcoThinking) {
                dynamicScale = 1 + Math.sin(time * 8) * 0.1;
            } else if (audioPlaying) {
                dynamicScale = 1 + Math.sin(time * 15) * 0.15;
            }

            meshRef.current.scale.setScalar(scaleFactor * dynamicScale);
            meshRef.current.rotation.y = time * 0.2;
            meshRef.current.rotation.x = time * 0.1;
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

const EcoBubble: React.FC<EcoBubbleProps> = (props) => {
    return (
        <Canvas camera={{ position: [0, 0, 3], fov: 75 }}>
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} castShadow />
            <pointLight position={[-10, -10, -10]} />
            <Bubble {...props} />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
            <Environment preset="sunset" background />
        </Canvas>
    );
};

export default EcoBubble;