import React from 'react';

interface GlassBubbleProps {
  color: string;
}

const GlassBubble: React.FC<GlassBubbleProps> = ({ color }) => {
  return (
    <div className="glass-bubble-container relative w-48 h-48 sm:w-64 sm:h-64 floating">
      {/* Main glass bubble */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, white 0%, ${color}10 30%, ${color}20 60%, ${color}30 100%)`,
          boxShadow: `0 8px 32px 0 rgba(31, 38, 135, 0.2), 
                     inset 0 -10px 20px 0 ${color}30,
                     inset 0 10px 20px 0 rgba(255, 255, 255, 0.7)`,
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          transform: 'scale(1)',
          transition: 'transform 0.3s ease-out',
        }}
      />
      
      {/* Highlight/reflection effect */}
      <div 
        className="absolute w-3/5 h-1/4 rounded-full"
        style={{
          background: 'linear-gradient(120deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)',
          top: '20%',
          left: '20%',
          transform: 'rotate(-45deg)',
        }}
      />
      
      {/* Bottom shadow */}
      <div 
        className="absolute bottom-0 left-1/2 w-3/4 h-4 rounded-full transform -translate-x-1/2 translate-y-10 opacity-40"
        style={{
          background: `radial-gradient(ellipse at center, ${color}80 0%, transparent 70%)`,
          filter: 'blur(4px)',
        }}
      />

      {/* Additional small highlight */}
      <div 
        className="absolute w-1/5 h-1/5 rounded-full"
        style={{
          background: 'linear-gradient(120deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 100%)',
          top: '30%',
          right: '25%',
          transform: 'rotate(30deg)',
        }}
      />
      
      {/* Inner light effect */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at center, ${color}10 0%, transparent 70%)`,
          filter: 'blur(5px)',
        }}
      />
      
      {/* Pulse animation */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          border: `1px solid ${color}30`,
          animation: 'pulse 2s infinite',
        }}
      />
    </div>
  );
};

export default GlassBubble;