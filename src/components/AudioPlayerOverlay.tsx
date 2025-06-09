import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface AudioPlayerOverlayProps {
  audioUrl: string;
  onClose: () => void;
}

const AudioPlayerOverlay: React.FC<AudioPlayerOverlayProps> = ({ audioUrl, onClose }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.play();

    const interval = setInterval(() => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    }, 200);

    audio.addEventListener('ended', () => setIsPlaying(false));

    return () => {
      clearInterval(interval);
      audio.pause();
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    isPlaying ? audioRef.current.pause() : audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const seek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime += seconds;
    }
  };

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, '0');
    return `${min}:${sec}`;
  };

  const IconWrapper = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
    >
      {children}
    </button>
  );

  const PauseIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="1.5" strokeLinecap="round">
      <rect x="6" y="4" width="3" height="16" rx="1.5" />
      <rect x="15" y="4" width="3" height="16" rx="1.5" />
    </svg>
  );

  const PlayIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  const ArrowCircle = ({ direction }: { direction: 'left' | 'right' }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      {direction === 'left' ? (
        <path d="M13 8l-4 4 4 4" />
      ) : (
        <path d="M11 8l4 4-4 4" />
      )}
    </svg>
  );

  return (
    <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-full shadow-md px-4 py-2 flex items-center gap-4 z-50 backdrop-blur-sm">
      <IconWrapper onClick={togglePlay}>
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </IconWrapper>

      <span className="text-sm font-sans font-light text-black w-12 text-center tracking-tight">
        {formatTime(currentTime)}
      </span>

      <IconWrapper onClick={() => seek(-15)}>
        <ArrowCircle direction="left" />
      </IconWrapper>

      <IconWrapper onClick={() => seek(15)}>
        <ArrowCircle direction="right" />
      </IconWrapper>

      <IconWrapper onClick={onClose}>
        <X className="w-5 h-5 stroke-[1.5]" />
      </IconWrapper>
    </div>
  );
};

export default AudioPlayerOverlay;
