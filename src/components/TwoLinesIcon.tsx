import React from 'react';

interface TwoLinesIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const TwoLinesIcon: React.FC<TwoLinesIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 0.75 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 7 L21 7" /> {/* Linha de cima (inalterada) */}
    <path d="M3 17 L15 17" /> {/* Linha de baixo (encurtada para terminar em 15) */}
  </svg>
);

export default TwoLinesIcon;